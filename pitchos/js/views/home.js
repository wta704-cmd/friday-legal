// 홈(경기·투표): 다음 경기 히어로 카드, 원탭 참석 투표, 전술판 라인업,
// 일정 목록, 구장.
//
// 쓰기는 모두 네이티브 앱과 같은 RPC(create_match, upsert_rsvp, finalize_rsvp,
// replace_lineup)로 보낸다. 소유권·마감 시각 판단은 서버가 한다.

import { matches as matchesApi, pitches as pitchesApi } from '../api.js';
import { state, loadMatches, loadMembers, currentTeam, canManage, memberMap } from '../store.js';
import * as fmt from '../lib/format.js';
import { draftLineup, PER_SIDE } from '../lib/lineup.js';
import { buildMatchPatch, autoTitle, defaultDeadline } from '../lib/matchEdit.js';
import {
  planQuarters,
  describePlan,
  matchTiming,
  QUARTER_MINUTES,
  QUARTER_COUNT,
  BREAK_MINUTES,
  TOTAL_MINUTES,
} from '../lib/quarters.js';
import {
  h,
  badge,
  matchStatusBadge,
  button,
  icon,
  crest,
  openSheet,
  confirmDialog,
  toast,
  emptyState,
  section,
  card,
  spinner,
  mount,
  input,
  stepper,
  switchToggle,
  pitchBoard,
  avatarStack,
} from '../ui.js';
import { appHeader, teamSwitcher, renderScreen, iconButton, noTeamState } from './common.js';
import { openCreateTeam } from './teamForms.js';

const rsvpCache = new Map();

async function loadRsvps(matchId, force = false) {
  if (!force && rsvpCache.has(matchId)) return rsvpCache.get(matchId);
  const rows = (await matchesApi.rsvps(matchId)) || [];
  rsvpCache.set(matchId, rows);
  return rows;
}

function counts(rows) {
  const out = { going: 0, late: 0, maybe: 0, declined: 0, no_response: 0 };
  for (const row of rows || []) out[row.status] = (out[row.status] || 0) + 1;
  return out;
}

function attending(rows) {
  return (rows || []).filter((row) => row.status === 'going' || row.status === 'late');
}

function myRow(rows) {
  const uid = state.profile?.id;
  return (rows || []).find((row) => row.user_id === uid) || null;
}

function isClosed(match) {
  return fmt.deadlineState(match.rsvp_deadline_at).closed;
}

function dday(kickoff) {
  const p = fmt.kstParts(kickoff);
  const now = fmt.kstParts(new Date());
  if (!p) return { text: '—', today: false };
  const a = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const b = Date.UTC(Number(now.year), Number(now.month) - 1, Number(now.day));
  const diff = Math.round((a - b) / 86_400_000);
  if (diff === 0) return { text: 'D-DAY', today: true };
  return { text: diff > 0 ? `D-${diff}` : `D+${-diff}`, today: false };
}

function opponentName(match) {
  if (match.opponent_name) return match.opponent_name;
  const title = String(match.title || '').replace(/^vs\s*/i, '').trim();
  return title || '상대 팀';
}

function metaItem(iconName, text) {
  return h('span', { class: 'hero-meta-item' }, icon(iconName, { size: 13 }), text);
}

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

const VOTE_CHOICES = [
  { status: 'going', label: '참석', tone: 'ok', iconName: 'check' },
  { status: 'late', label: '지각', tone: 'warn', iconName: 'clock' },
  { status: 'maybe', label: '미정', tone: 'muted', iconName: 'help' },
  { status: 'declined', label: '불참', tone: 'bad', iconName: 'x' },
];

function askLateMinutes(match, current, onChange) {
  const options = [5, 10, 15, 20, 30, 45, 60];
  const sheet = openSheet({
    title: '몇 분 늦나요?',
    subtitle: '지각 시간은 팀원에게 함께 표시됩니다.',
    render: (body) => {
      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          h(
            'div',
            { class: 'eta-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' } },
            ...options.map((minutes) =>
              h(
                'button',
                {
                  class: `btn ${current === minutes ? 'btn-primary' : 'btn-ghost'}`,
                  type: 'button',
                  style: { minHeight: '46px' },
                  onclick: async () => {
                    try {
                      await matchesApi.setRsvp(match.id, 'late', minutes);
                      rsvpCache.delete(match.id);
                      toast(`지각 ${minutes}분으로 투표했습니다.`, { kind: 'ok' });
                      sheet.close();
                      onChange?.();
                    } catch (error) {
                      toast(error.message, { kind: 'error', ms: 4000 });
                    }
                  },
                },
                `${minutes}분`,
              ),
            ),
          ),
          h('p', { class: 'hint-box' }, '마감 전에는 언제든 다시 눌러 바꿀 수 있습니다.'),
        ),
      );
    },
  });
}

function voteControl(match, rows, onChange) {
  const mine = myRow(rows);
  const closed = isClosed(match);

  const buttons = VOTE_CHOICES.map((choice) => {
    const active = mine?.status === choice.status;
    const label =
      choice.status === 'late' && active && mine?.late_eta_min
        ? `지각 ${mine.late_eta_min}분`
        : choice.label;
    return h(
      'button',
      {
        class: `vote-btn vote-${choice.tone}${active ? ' is-active' : ''}`,
        type: 'button',
        disabled: closed || null,
        onclick: async () => {
          if (closed) return;
          if (choice.status === 'late') {
            askLateMinutes(match, mine?.status === 'late' ? mine.late_eta_min : null, onChange);
            return;
          }
          if (active) return;
          try {
            await matchesApi.setRsvp(match.id, choice.status, null);
            rsvpCache.delete(match.id);
            toast(`${choice.label}으로 투표했습니다.`, { kind: 'ok' });
            onChange?.();
          } catch (error) {
            toast(error.message, { kind: 'error', ms: 4000 });
          }
        },
      },
      icon(choice.iconName, { size: 16 }),
      label,
    );
  });

  return h(
    'div',
    { class: 'vote-block', style: { display: 'flex', flexDirection: 'column', gap: '9px' } },
    h('div', { class: 'vote-seg' }, ...buttons),
    h(
      'p',
      { class: 'vote-note' },
      closed
        ? '투표가 마감되었습니다.'
        : mine
          ? h('span', null, '내 투표 ', h('b', null, fmt.lateText(mine.status, mine.late_eta_min)), ` · ${fmt.deadlineState(match.rsvp_deadline_at).text}`)
          : '아직 투표하지 않았습니다.',
    ),
  );
}

function attendanceBlock(rows, onOpen) {
  const c = counts(rows);
  const total = c.going + c.late + c.maybe + c.declined;
  if (!total) {
    return h('p', { class: 'hint-box' }, '아직 투표한 팀원이 없습니다. 먼저 참석 여부를 남겨 보세요.');
  }
  const pct = (value) => `${Math.round((value / total) * 100)}%`;
  return h(
    'div',
    { class: 'attend' },
    h(
      'div',
      { class: 'attend-bar' },
      c.going ? h('span', { class: 'attend-seg ok', style: { width: pct(c.going) } }) : null,
      c.late ? h('span', { class: 'attend-seg warn', style: { width: pct(c.late) } }) : null,
      c.maybe ? h('span', { class: 'attend-seg muted', style: { width: pct(c.maybe) } }) : null,
      c.declined ? h('span', { class: 'attend-seg bad', style: { width: pct(c.declined) } }) : null,
    ),
    onOpen
      ? h(
          'button',
          { class: 'attend-foot', type: 'button', onclick: onOpen },
          h(
            'span',
            { class: 'row', style: { gap: '8px' } },
            avatarStack(attending(rows), { max: 4 }),
            h(
              'span',
              { class: 'attend-figure' },
              h('b', null, String(c.going + c.late)),
              h('span', { class: 'attend-figure-label' }, '명 참석'),
              h('span', { class: 'attend-figure-total' }, `/ ${total}명`),
            ),
          ),
          icon('chevron', { size: 14, className: 'chev' }),
        )
      : null,
    h(
      'div',
      { class: 'attend-legend' },
      h('span', null, h('i', { class: 'legend-dot ok' }), `참석 ${c.going}`),
      c.late ? h('span', null, h('i', { class: 'legend-dot warn' }), `지각 ${c.late}`) : null,
      h('span', null, h('i', { class: 'legend-dot muted' }), `미정 ${c.maybe}`),
      h('span', null, h('i', { class: 'legend-dot bad' }), `불참 ${c.declined}`),
    ),
  );
}

// ---------------------------------------------------------------------------
// Hero card
// ---------------------------------------------------------------------------

function heroSide(name, logoUrl, label, away = false) {
  return h(
    'div',
    { class: `hero-side${away ? ' is-away' : ''}` },
    crest(name, { size: 40, logoUrl, tone: logoUrl ? 'crest' : away ? 'ghost' : 'light' }),
    h(
      'div',
      { style: { minWidth: '0' } },
      h('span', { class: 'hero-side-name' }, name),
      h('span', { class: 'hero-side-sub' }, label),
    ),
  );
}

function heroCard(match, team, onEdit = null) {
  const d = dday(match.kickoff_at);
  const dl = fmt.deadlineState(match.rsvp_deadline_at);
  const practice = match.kind === 'practice';
  return h(
    'section',
    { class: 'hero' },
    h(
      'div',
      { class: 'hero-top' },
      match.status === 'live'
        ? h('span', { class: 'badge badge-live' }, 'LIVE')
        : h('span', { class: `dday${d.today ? ' is-today' : ''}` }, d.text),
      h('span', { class: 'hero-kind' }, practice ? '팀 연습' : '경기'),
      h(
        'span',
        { class: 'hero-deadline' },
        dl.closed
          ? h('span', { class: 'badge badge-closed' }, '마감')
          : [icon('clock', { size: 12 }), dl.text],
      ),
      onEdit
        ? h(
            'button',
            { class: 'hero-edit', type: 'button', 'aria-label': '경기 수정', onclick: onEdit },
            icon('edit', { size: 14 }),
          )
        : null,
    ),
    // 스코어 자리에 킥오프 시각을 크게 둔다. 팀 이름은 좌우로, 시각이 경기의 중심.
    h(
      'div',
      { class: `hero-matchup${practice ? ' is-practice' : ''}` },
      heroSide(team.name, team.logo_url, practice ? '자체 연습' : '우리 팀'),
      h(
        'div',
        { class: 'hero-clock' },
        h('span', { class: 'hero-clock-time' }, fmt.formatClock(match.kickoff_at)),
        h('span', { class: 'hero-clock-date' }, fmt.formatMonthDay(match.kickoff_at)),
      ),
      practice ? null : heroSide(opponentName(match), null, '상대 팀', true),
    ),
    h(
      'div',
      { class: 'hero-meta' },
      metaItem('pin', match.pitch_name || '구장 미정'),
      metaItem('flag', `${match.quarter_count}쿼터 × ${match.quarter_minutes}분`),
    ),
  );
}

// ---------------------------------------------------------------------------
// Lineup board
// ---------------------------------------------------------------------------

function lineupCard({ match, rows, saved, onSaved, showTitle = true }) {
  const names = memberMap();
  const nameOf = (userId) => names.get(userId)?.display_name || '팀원';
  let draft = null;
  let quarter = 1;
  const holder = h('div', { class: 'card lineup' });

  function quarterRows() {
    const source = draft || saved || [];
    return source.filter((row) => Number(row.quarter) === quarter);
  }

  function draw() {
    const manager = canManage();
    const going = attending(rows);
    const placed = quarterRows();
    const tabs = h(
      'div',
      { class: 'quarter-tabs' },
      ...Array.from({ length: Number(match.quarter_count) || 4 }, (_, index) => {
        const value = index + 1;
        return h(
          'button',
          {
            class: `quarter-tab${quarter === value ? ' is-active' : ''}`,
            type: 'button',
            onclick: () => {
              quarter = value;
              draw();
            },
          },
          `${value}Q`,
        );
      }),
    );

    const bench = going.filter((row) => !placed.some((item) => item.user_id === row.user_id));

    const parts = [
      showTitle
        ? h(
            'div',
            { class: 'lineup-top' },
            h('h3', { class: 'card-title' }, '라인업'),
            h(
              'span',
              { class: 'card-sub' },
              `${match.quarter_count}쿼터 · ${PER_SIDE[match.mode] || 5}:${PER_SIDE[match.mode] || 5}`,
            ),
          )
        : null,
      tabs,
      pitchBoard({
        rows: placed,
        nameOf,
        mode: match.mode,
        empty: {
          title: manager ? '자동 배분으로 시작하세요' : '라인업이 아직 없습니다',
          body: manager
            ? going.length
              ? `참석·지각 ${going.length}명으로 포지션을 나눠 배치합니다.`
              : '참석·지각으로 투표한 팀원이 있어야 만들 수 있습니다.'
            : '팀장이 라인업을 짜면 여기에 표시됩니다.',
        },
      }),
    ];

    if (placed.length) {
      parts.push(
        h(
          'div',
          { class: 'bench' },
          h('span', { class: 'bench-label' }, '이번 쿼터'),
          h('span', { class: 'bench-chip' }, `${placed.length}명 출전`),
          bench.length
            ? h('span', { class: 'bench-chip' }, `대기 ${bench.length}명`)
            : null,
        ),
      );
    }

    if (draft) {
      parts.push(h('p', { class: 'hint-box' }, `초안 ${draft.length}개 배치 — 저장하면 기존 라인업을 대체합니다.`));
    }

    if (manager) {
      parts.push(
        h(
          'div',
          { class: 'lineup-actions' },
          button(draft ? '다시 배분' : '자동 배분', {
            kind: 'ghost',
            iconName: 'sparkles',
            disabled: going.length === 0,
            onClick: () => {
              draft = draftLineup({
                quarterCount: match.quarter_count,
                perSide: PER_SIDE[match.mode] || 5,
                players: going.map((row) => ({
                  user_id: row.user_id,
                  position: names.get(row.user_id)?.position || null,
                })),
              });
              quarter = 1;
              draw();
            },
          }),
          draft
            ? button('라인업 저장', {
                iconName: 'check',
                onClick: async (event) => {
                  const target = event.currentTarget;
                  target.disabled = true;
                  try {
                    const savedCount = await matchesApi.saveLineup(match.id, draft);
                    toast(`${savedCount}개 배치를 저장했습니다.`, { kind: 'ok' });
                    draft = null;
                    onSaved?.();
                  } catch (error) {
                    toast(error.message, { kind: 'error', ms: 4200 });
                  } finally {
                    target.disabled = false;
                  }
                },
              })
            : null,
        ),
      );
    }

    holder.replaceChildren(...parts.filter(Boolean));
  }

  draw();
  return holder;
}

// ---------------------------------------------------------------------------
// Match detail sheet
// ---------------------------------------------------------------------------

function infoRow(label, value) {
  return h(
    'div',
    { class: 'info-row' },
    h('span', { class: 'info-label' }, label),
    h('span', { class: 'info-value' }, value),
  );
}

async function openMatchSheet(match, ctx) {
  const sheet = openSheet({
    title: match.title,
    subtitle: fmt.formatKickoff(match.kickoff_at),
    render: async (body) => {
      async function draw() {
        mount(body, spinner('경기 정보를 불러오는 중…'));
        const [rsvps, lineups] = await Promise.all([loadRsvps(match.id, true), matchesApi.lineups(match.id)]);
        const c = counts(rsvps);
        const manager = canManage();
        const closed = isClosed(match);
        const timing = matchTiming({
          quarters: match.quarter_count,
          quarterMinutes: match.quarter_minutes,
        });
        const rows = [...rsvps].sort((a, b) => {
          const order = { going: 0, late: 1, maybe: 2, declined: 3, no_response: 4 };
          return (order[a.status] ?? 5) - (order[b.status] ?? 5);
        });

        mount(
          body,
          h(
            'div',
            { class: 'stack' },
            h(
              'div',
              { class: 'meta-grid' },
              h('div', { class: 'meta-cell' }, h('span', { class: 'meta-label' }, '일시'), h('span', { class: 'meta-value' }, fmt.formatKickoff(match.kickoff_at))),
              h('div', { class: 'meta-cell' }, h('span', { class: 'meta-label' }, '구장'), h('span', { class: 'meta-value' }, match.pitch_name || '구장 미정')),
              h(
                'div',
                { class: 'meta-cell' },
                h('span', { class: 'meta-label' }, '쿼터'),
                h('span', { class: 'meta-value' }, `${match.quarter_count} × ${match.quarter_minutes}분`),
                h(
                  'span',
                  { class: 'meta-sub' },
                  `총 ${timing.elapsedMinutes}분 · 휴식 ${timing.breakCount}회`,
                ),
              ),
              h('div', { class: 'meta-cell' }, h('span', { class: 'meta-label' }, '방식'), h('span', { class: 'meta-value' }, match.is_indoor ? '실내 · 시간/심박' : '야외 · GPS')),
            ),
            card(
              h('h3', { class: 'card-title' }, '내 투표'),
              voteControl(match, rsvps, draw),
              attendanceBlock(rsvps),
            ),
            manager
              ? button('경기 수정', {
                  kind: 'ghost',
                  block: true,
                  iconName: 'edit',
                  onClick: () => {
                    sheet.close();
                    openEditMatch(ctx, match);
                  },
                })
              : null,
            manager && match.status === 'scheduled'
              ? card(
                  h('div', { class: 'card-head' },
                    h('h3', { class: 'card-title' }, '투표 마감'),
                    matchStatusBadge(match.status, fmt.MATCH_STATUS_LABEL[match.status] || match.status),
                  ),
                  button(closed ? '마감하고 미응답자 불참 처리' : '투표 마감', {
                    kind: closed ? 'primary' : 'ghost',
                    block: true,
                    disabled: !closed,
                    iconName: 'lock',
                    onClick: async () => {
                      const ok = await confirmDialog({
                        title: '투표를 지금 마감할까요?',
                        message: '마감하면 응답하지 않은 팀원은 불참으로 기록되고, 이후 투표를 바꿀 수 없습니다.',
                        confirmLabel: '마감',
                      });
                      if (!ok) return;
                      try {
                        const inserted = await matchesApi.finalize(match.id);
                        toast(`마감했습니다. 미응답 ${inserted}명을 불참으로 기록했습니다.`, { kind: 'ok', ms: 4000 });
                        await draw();
                        void ctx.render();
                      } catch (error) {
                        toast(error.message, { kind: 'error', ms: 4200 });
                      }
                    },
                  }),
                  h(
                    'p',
                    { class: 'hint-box' },
                    closed
                      ? '마감 시각이 지났습니다. 마감하면 미응답자는 불참이 됩니다.'
                      : `${fmt.formatDateTime(match.rsvp_deadline_at)} 이후에 마감할 수 있습니다.`,
                  ),
                )
              : null,
            section(
              '투표 현황',
              h('span', { class: 'section-note' }, `${rsvps.length}명`),
              h(
                'div',
                { class: 'list' },
                ...(rows.length
                  ? rows.map((row) =>
                      h(
                        'div',
                        { class: 'member-row' },
                        crest(row.display_name || 'P', { size: 34, tone: 'avatar' }),
                        h(
                          'div',
                          { class: 'member-main' },
                          h(
                            'span',
                            { class: 'member-name' },
                            row.display_name,
                            row.user_id === state.profile?.id ? h('span', { class: 'me-tag' }, '나') : null,
                          ),
                          h(
                            'span',
                            { class: 'member-meta' },
                            [fmt.ROLE_LABEL[row.role] || row.role, row.position].filter(Boolean).join(' · '),
                          ),
                        ),
                        badge(fmt.lateText(row.status, row.late_eta_min), fmt.RSVP_TONE[row.status] || 'muted'),
                      ),
                    )
                  : [h('p', { class: 'muted small pad' }, '아직 투표한 팀원이 없습니다.')]),
              ),
            ),
            lineupCard({ match, rows: rsvps, saved: lineups || [], onSaved: draw }),
            h(
              'p',
              { class: 'hint-box' },
              `투표 마감 ${match.rsvp_deadline_at ? fmt.formatDateTime(match.rsvp_deadline_at) : '없음'} · ${fmt.MODE_LABEL[match.mode] || match.mode} ${match.kind === 'practice' ? '팀 연습' : '경기'}`,
            ),
          ),
        );
      }
      try {
        await draw();
      } catch (error) {
        mount(
          body,
          h(
            'div',
            { class: 'empty' },
            h('p', { class: 'empty-title' }, '불러오지 못했습니다'),
            h('p', { class: 'empty-body' }, error.message),
          ),
        );
      }
    },
  });
  return sheet;
}

// ---------------------------------------------------------------------------
// Create match
// ---------------------------------------------------------------------------

function nextSaturdayEvening() {
  const now = new Date();
  const kstNow = fmt.kstParts(now);
  const base = new Date(`${kstNow.year}-${kstNow.month}-${kstNow.day}T20:00:00+09:00`);
  const day = new Date(`${kstNow.year}-${kstNow.month}-${kstNow.day}T12:00:00+09:00`).getUTCDay();
  const add = (6 - day + 7) % 7 || 7;
  base.setDate(base.getDate() + add);
  return fmt.toLocalInput(base.toISOString());
}

function openCreateMatch(ctx) {
  const team = currentTeam();
  let kind = 'match';
  const kindSeg = h('div', { class: 'vote-seg', style: { gridTemplateColumns: '1fr 1fr' } });
  function drawKind() {
    kindSeg.replaceChildren(
      ...[
        { value: 'match', label: '경기' },
        { value: 'practice', label: '팀 연습' },
      ].map((option) =>
        h(
          'button',
          {
            class: `vote-btn${kind === option.value ? ' is-active vote-muted' : ''}`,
            type: 'button',
            style: { height: '46px', flexDirection: 'row', gap: '5px' },
            onclick: () => {
              kind = option.value;
              drawKind();
              opponent.el.style.display = kind === 'practice' ? 'none' : '';
            },
          },
          option.label,
        ),
      ),
    );
  }
  drawKind();

  const kickoff = input({
    label: '경기 일시',
    type: 'datetime-local',
    value: nextSaturdayEvening(),
    hint: '투표는 경기 48시간 전 22시(한국시간)에 자동 마감됩니다.',
  });
  const opponent = input({ label: '상대 팀 이름', placeholder: '예: 화이트울브스', maxlength: 40 });
  const pitchName = input({ label: '구장 이름', placeholder: '예: 강남 풋살파크 A구장', maxlength: 60 });
  // 시간 계획: 총 경기 시간 · 쿼터 시간 · 쉬는 시간을 넣으면 쿼터 수가 자동으로 맞춰진다.
  // (120분 · 12분 · 1분 → 9쿼터, 실제 9×12 + 8×1 = 116분)
  let manualQuarters = null; // null이면 자동 계산, 숫자면 사용자가 직접 조정
  let plan = planQuarters({
    totalMinutes: TOTAL_MINUTES.default,
    quarterMinutes: QUARTER_MINUTES.default,
    breakMinutes: BREAK_MINUTES.default,
  });

  const planNoteText = h('span', { class: 'plan-note-text' });
  const planState = h('span', { class: 'plan-state' });
  const planReset = h(
    'button',
    {
      class: 'link-btn',
      type: 'button',
      onclick: () => {
        manualQuarters = null;
        syncPlan();
      },
    },
    '자동으로',
  );

  const totalField = stepper({
    label: '총 경기 시간',
    value: plan.totalMinutes,
    min: TOTAL_MINUTES.min,
    max: TOTAL_MINUTES.max,
    step: 5,
    chips: [60, 90, 120, 150, 180],
    onChange: () => {
      manualQuarters = null;
      syncPlan();
    },
  });
  const quarterField = stepper({
    label: '쿼터 시간',
    value: plan.quarterMinutes,
    min: QUARTER_MINUTES.min,
    max: QUARTER_MINUTES.max,
    step: 1,
    chips: [10, 11, 12, 13, 14, 15],
    onChange: () => {
      manualQuarters = null;
      syncPlan();
    },
  });
  const breakField = stepper({
    label: '쉬는 시간',
    value: plan.breakMinutes,
    min: BREAK_MINUTES.min,
    max: BREAK_MINUTES.max,
    step: 1,
    chips: [0, 1, 2, 3],
    onChange: () => {
      manualQuarters = null;
      syncPlan();
    },
  });
  const countField = stepper({
    label: '쿼터 수',
    ariaLabel: '쿼터 수',
    value: plan.quarters,
    min: QUARTER_COUNT.min,
    max: QUARTER_COUNT.max,
    step: 1,
    suffix: '쿼터',
    hint: '총 경기 시간에서 자동으로 계산됩니다. − / + 로 직접 조정해도 됩니다.',
    onChange: (value) => {
      manualQuarters = value;
      syncPlan();
    },
  });
  const planNote = h('div', { class: 'plan-note' }, planNoteText, h('span', { class: 'plan-state-slot' }, planState, planReset));

  function syncPlan() {
    plan = planQuarters({
      totalMinutes: totalField.value,
      quarterMinutes: quarterField.value,
      breakMinutes: breakField.value,
      quarters: manualQuarters,
    });
    countField.set(plan.quarters, { silent: true });
    planNoteText.textContent = describePlan(plan);
    planState.textContent = plan.manual ? '직접 조정' : '자동 계산';
    planState.classList.toggle('is-manual', plan.manual);
    planReset.hidden = !plan.manual;
    planNote.classList.toggle('is-warn', plan.spareMinutes < 0);
  }
  syncPlan();

  let indoor = false;

  const sheet = openSheet({
    title: '경기 만들기',
    subtitle: `${team.name} · ${fmt.MODE_LABEL[team.mode] || team.mode}`,
    render: (body) => {
      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, '종류'), kindSeg),
          kickoff.el,
          opponent.el,
          pitchName.el,
          h(
            'div',
            { class: 'plan-block' },
            totalField.el,
            quarterField.el,
            h('div', { class: 'field-row' }, breakField.el, countField.el),
            planNote,
          ),
          h(
            'div',
            { class: 'share-row' },
            h(
              'div',
              { class: 'share-row-main' },
              h('span', { class: 'share-title' }, '실내 구장'),
              h('span', { class: 'share-sub' }, 'GPS 없이 시간·심박만 기록합니다.'),
            ),
            switchToggle({ checked: false, label: '실내 구장', onChange: (next) => (indoor = next) }),
          ),
          button('경기 만들기', {
            block: true,
            size: 'lg',
            iconName: 'plus',
            onClick: async (event) => {
              const target = event.currentTarget;
              const iso = fmt.fromLocalInput(kickoff.value);
              if (!iso) {
                toast('경기 일시를 선택해 주세요.', { kind: 'error' });
                return;
              }
              if (new Date(iso).getTime() < Date.now() - 60_000) {
                toast('지난 시각으로는 만들 수 없습니다.', { kind: 'error' });
                return;
              }
              if (plan.spareMinutes < 0) {
                toast('총 경기 시간이 실제 진행 시간보다 짧습니다. 쿼터 수나 쿼터 시간을 조정해 주세요.', {
                  kind: 'error',
                  ms: 4400,
                });
                return;
              }
              target.disabled = true;
              try {
                await matchesApi.create({
                  teamId: team.id,
                  kind,
                  kickoff: iso,
                  pitchName: pitchName.value.trim(),
                  indoor,
                  quarterCount: plan.quarters,
                  quarterMinutes: quarterField.value,
                  opponent: opponent.value.trim(),
                });
                toast('경기를 만들었습니다.', { kind: 'ok' });
                sheet.close();
                rsvpCache.clear();
                ctx.render();
              } catch (error) {
                toast(error.message, { kind: 'error', ms: 4200 });
              } finally {
                target.disabled = false;
              }
            },
          }),
        ),
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Edit match
// ---------------------------------------------------------------------------

/** 두 개·세 개 중 하나를 고르는 가로 세그먼트. 경기 생성 시트와 같은 모양. */
function segmentField(label, options, value, onChange) {
  let current = value;
  const row = h('div', {
    class: 'vote-seg',
    style: { gridTemplateColumns: `repeat(${options.length}, 1fr)` },
  });
  function draw() {
    row.replaceChildren(
      ...options.map((option) =>
        h(
          'button',
          {
            class: `vote-btn${current === option.value ? ' is-active vote-muted' : ''}`,
            type: 'button',
            'aria-pressed': current === option.value ? 'true' : 'false',
            style: { height: '44px', flexDirection: 'row', gap: '5px' },
            onclick: () => {
              if (current === option.value) return;
              current = option.value;
              draw();
              onChange(option.value);
            },
          },
          option.label,
        ),
      ),
    );
  }
  draw();
  return { el: h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), row), get value() { return current; } };
}

/**
 * 기존 경기 수정 시트. 팀 운영진만 열 수 있고, 저장은 `matches` PATCH 한 번이다
 * (권한은 matches_update RLS가 판단). 어떤 열이 나가는지는 lib/matchEdit가 정한다.
 * 저장되면 갱신된 경기 행을 돌려준다(닫기만 하면 null).
 */
function openEditMatch(ctx, match, { onSaved = null } = {}) {
  return new Promise((resolve) => {
    const previousAuto = autoTitle(match.kind, match.opponent_name);
    let indoor = Boolean(match.is_indoor);
    let deadlineTouched = false;
    let saved = false;

    const title = input({ label: '경기 이름', value: match.title, maxlength: 60, required: true });
    const kickoff = input({
      label: '경기 일시',
      type: 'datetime-local',
      value: fmt.toLocalInput(match.kickoff_at),
      hint: '투표 마감은 경기 48시간 전 22시(한국시간)가 기본입니다.',
    });
    const opponent = input({
      label: '상대 팀 이름',
      value: match.opponent_name || '',
      placeholder: '예: 화이트울브스',
      maxlength: 40,
    });
    const pitchName = input({
      label: '구장 이름',
      value: match.pitch_name || '',
      placeholder: '예: 강남 풋살파크 A구장',
      maxlength: 60,
    });
    const deadline = input({
      label: '투표 마감',
      type: 'datetime-local',
      value: fmt.toLocalInput(match.rsvp_deadline_at),
    });
    deadline.input.addEventListener('input', () => {
      deadlineTouched = true;
    });

    const kindField = segmentField(
      '종류',
      [
        { value: 'match', label: '경기' },
        { value: 'practice', label: '팀 연습' },
      ],
      match.kind === 'practice' ? 'practice' : 'match',
      (value) => {
        opponent.el.style.display = value === 'practice' ? 'none' : '';
        followAutoTitle();
      },
    );
    const modeField = segmentField(
      '경기 유형',
      [
        { value: 'futsal', label: '풋살' },
        { value: 'soccer', label: '축구' },
      ],
      match.mode === 'soccer' ? 'soccer' : 'futsal',
      () => undefined,
    );
    opponent.el.style.display = kindField.value === 'practice' ? 'none' : '';

    // 제목이 자동 제목(예: 'vs 화이트울브스')이면 종류·상대를 바꿀 때 같이 바꾼다.
    // 손으로 고친 제목은 절대 건드리지 않는다.
    function followAutoTitle() {
      if (title.input.value.trim() !== previousAuto) return;
      title.input.value = autoTitle(kindField.value, opponent.input.value);
    }
    opponent.input.addEventListener('input', followAutoTitle);

    const timingText = h('span', { class: 'plan-note-text' });
    const quarterField = stepper({
      label: '쿼터 시간',
      value: match.quarter_minutes,
      min: QUARTER_MINUTES.min,
      max: QUARTER_MINUTES.max,
      step: 1,
      chips: [10, 11, 12, 13, 14, 15],
      onChange: () => syncTiming(),
    });
    const countField = stepper({
      label: '쿼터 수',
      ariaLabel: '쿼터 수',
      value: match.quarter_count,
      min: QUARTER_COUNT.min,
      max: QUARTER_COUNT.max,
      step: 1,
      suffix: '쿼터',
      hint: '− / + 로 1쿼터씩 조정할 수 있습니다.',
      onChange: () => syncTiming(),
    });
    function syncTiming() {
      const timing = matchTiming({ quarters: countField.value, quarterMinutes: quarterField.value });
      timingText.textContent = `총 ${timing.elapsedMinutes}분 진행 · 휴식 ${timing.breakMinutes}분×${timing.breakCount}회`;
    }
    syncTiming();

    function syncDeadlineFromKickoff() {
      if (deadlineTouched) return;
      const iso = fmt.fromLocalInput(kickoff.input.value);
      if (!iso) return;
      deadline.input.value = fmt.toLocalInput(defaultDeadline(iso));
    }
    kickoff.input.addEventListener('input', syncDeadlineFromKickoff);

    const deadlineAuto = h(
      'button',
      {
        class: 'link-btn',
        type: 'button',
        onclick: () => {
          deadlineTouched = false;
          const iso = fmt.fromLocalInput(kickoff.input.value);
          deadline.input.value = iso ? fmt.toLocalInput(defaultDeadline(iso)) : '';
        },
      },
      '48시간 전 22시로',
    );

    let updatedRow = null;
    const sheet = openSheet({
      title: '경기 수정',
      subtitle: `${match.title} · ${fmt.formatKickoff(match.kickoff_at)}`,
      onClose: () => resolve(saved ? updatedRow : null),
      render: (body) => {
        body.appendChild(
          h(
            'div',
            { class: 'stack' },
            title.el,
            h('div', { class: 'field-row' }, kindField.el, modeField.el),
            kickoff.el,
            opponent.el,
            pitchName.el,
            h(
              'div',
              { class: 'plan-block' },
              quarterField.el,
              countField.el,
              h('div', { class: 'plan-note' }, timingText),
            ),
            h(
              'div',
              { class: 'field' },
              h('span', { class: 'field-label' }, '투표 마감'),
              deadline.input,
              h(
                'span',
                { class: 'field-hint' },
                '비우면 마감 없음. 경기 일시를 바꾸면 48시간 전 22시로 다시 계산됩니다.',
              ),
              h('div', { class: 'plan-note' }, deadlineAuto),
            ),
            h(
              'div',
              { class: 'share-row' },
              h(
                'div',
                { class: 'share-row-main' },
                h('span', { class: 'share-title' }, '실내 구장'),
                h('span', { class: 'share-sub' }, 'GPS 없이 시간·심박만 기록합니다.'),
              ),
              switchToggle({ checked: indoor, label: '실내 구장', onChange: (next) => (indoor = next) }),
            ),
            button('수정 저장', {
              block: true,
              size: 'lg',
              iconName: 'check',
              onClick: async (event) => {
                const target = event.currentTarget;
                const { patch, errors, unchanged } = buildMatchPatch(
                  match,
                  {
                    title: title.input.value,
                    kind: kindField.value,
                    mode: modeField.value,
                    kickoff: fmt.fromLocalInput(kickoff.input.value),
                    opponent: opponent.input.value,
                    pitchName: pitchName.input.value,
                    indoor,
                    quarterCount: countField.value,
                    quarterMinutes: quarterField.value,
                    deadline: deadline.input.value ? fmt.fromLocalInput(deadline.input.value) : '',
                  },
                  { followKickoff: !deadlineTouched },
                );
                if (errors.length) {
                  toast(errors[0], { kind: 'error', ms: 4200 });
                  return;
                }
                if (unchanged) {
                  toast('바뀐 내용이 없습니다.', { kind: 'info' });
                  return;
                }
                target.disabled = true;
                try {
                  const rows = await matchesApi.update(match.id, patch);
                  updatedRow = Array.isArray(rows) && rows.length ? rows[0] : { ...match, ...patch };
                  saved = true;
                  rsvpCache.clear();
                  toast('경기를 수정했습니다.', { kind: 'ok' });
                  sheet.close();
                  onSaved?.(updatedRow);
                  void ctx.render();
                } catch (error) {
                  toast(error.message, { kind: 'error', ms: 4200 });
                } finally {
                  target.disabled = false;
                }
              },
            }),
          ),
        );
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Pitches (4-point calibration)
// ---------------------------------------------------------------------------

function geoPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('이 브라우저에서는 위치를 가져올 수 없습니다.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      (error) => {
        const message =
          error.code === 1
            ? '위치 권한이 꺼져 있습니다. iPhone 설정 → Safari → 위치에서 허용해 주세요.'
            : error.code === 2
              ? '위치를 확인하지 못했습니다. 야외에서 다시 시도해 주세요.'
              : '위치를 가져오는 데 시간이 너무 오래 걸립니다.';
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  });
}

const CORNERS = [
  { key: 'near_left', label: '① 가까운 왼쪽' },
  { key: 'near_right', label: '② 가까운 오른쪽' },
  { key: 'far_right', label: '③ 먼 오른쪽' },
  { key: 'far_left', label: '④ 먼 왼쪽' },
];

function openPitchForm(ctx) {
  const team = currentTeam();
  const defaults = team.mode === 'soccer' ? { w: '105', h: '68' } : { w: '40', h: '20' };

  const name = input({ label: '구장 이름', placeholder: '예: 강남 풋살파크 A', maxlength: 60, required: true });
  const width = input({ label: '폭 (m)', type: 'number', value: defaults.w, min: 10, max: 130, step: '0.5' });
  const height = input({ label: '길이 (m)', type: 'number', value: defaults.h, min: 10, max: 100, step: '0.5' });
  let indoor = false;

  const cornerFields = CORNERS.map((corner) => {
    const lat = input({ label: '위도', type: 'number', step: '0.000001', inputmode: 'decimal', placeholder: '37.5…' });
    const lon = input({ label: '경도', type: 'number', step: '0.000001', inputmode: 'decimal', placeholder: '127.0…' });
    const here = button('현재 위치', {
      kind: 'soft',
      size: 'sm',
      iconName: 'pin',
      onClick: async (event) => {
        const target = event.currentTarget;
        target.disabled = true;
        try {
          const coords = await geoPosition();
          lat.input.value = coords.latitude.toFixed(6);
          lon.input.value = coords.longitude.toFixed(6);
          toast(`정확도 ±${Math.round(coords.accuracy)}m로 기록했습니다.`, { kind: 'ok' });
        } catch (error) {
          toast(error.message, { kind: 'error', ms: 4600 });
        } finally {
          target.disabled = false;
        }
      },
    });
    return { ...corner, lat, lon, here };
  });

  const sheet = openSheet({
    title: '구장 4점 등록',
    subtitle: '골대 뒤 왼쪽부터 시계 방향으로 네 꼭짓점을 찍습니다.',
    render: (body) => {
      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          h(
            'p',
            { class: 'hint-box' },
            '내 골대 뒤 왼쪽 → 오른쪽 → 상대 골대 오른쪽 → 왼쪽 순서로, 구장 네 귀퉁이에 서서 [현재 위치]를 누르면 정확합니다.',
          ),
          name.el,
          h('div', { class: 'field-row' }, width.el, height.el),
          h(
            'div',
            { class: 'share-row' },
            h(
              'div',
              { class: 'share-row-main' },
              h('span', { class: 'share-title' }, '실내 구장'),
              h('span', { class: 'share-sub' }, '실내면 GPS 대신 시간·심박으로 기록합니다.'),
            ),
            switchToggle({ checked: false, label: '실내 구장', onChange: (next) => (indoor = next) }),
          ),
          ...cornerFields.map((corner) =>
            h(
              'div',
              { class: 'corner-card' },
              h('div', { class: 'corner-head' }, h('span', { class: 'corner-title' }, corner.label), corner.here),
              h('div', { class: 'field-row' }, corner.lat.el, corner.lon.el),
            ),
          ),
          button('구장 저장', {
            block: true,
            size: 'lg',
            iconName: 'check',
            onClick: async (event) => {
              const target = event.currentTarget;
              const title = name.value.trim();
              const w = Number(width.value);
              const hgt = Number(height.value);
              if (!title) return toast('구장 이름을 입력해 주세요.', { kind: 'error' });
              if (!(w >= 10 && w <= 130)) return toast('폭은 10~130m 사이여야 합니다.', { kind: 'error' });
              if (!(hgt >= 10 && hgt <= 100)) return toast('길이는 10~100m 사이여야 합니다.', { kind: 'error' });

              const row = {
                team_id: team.id,
                name: title,
                mode: team.mode,
                width_m: w,
                height_m: hgt,
                is_indoor: indoor,
                created_by: state.profile.id,
                calibration: { source: 'web', corners: 'near_left,near_right,far_right,far_left' },
              };
              for (const corner of cornerFields) {
                const lat = Number(corner.lat.value);
                const lon = Number(corner.lon.value);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                  return toast(`${corner.label} 좌표를 입력하거나 [현재 위치]를 눌러 주세요.`, { kind: 'error', ms: 4200 });
                }
                if (lat < -90 || lat > 90) return toast(`${corner.label} 위도가 범위를 벗어났습니다.`, { kind: 'error' });
                if (lon < -180 || lon > 180) return toast(`${corner.label} 경도가 범위를 벗어났습니다.`, { kind: 'error' });
                row[`corner_${corner.key}_lat`] = lat;
                row[`corner_${corner.key}_lon`] = lon;
              }

              target.disabled = true;
              try {
                await pitchesApi.create(row);
                toast('구장을 등록했습니다.', { kind: 'ok' });
                sheet.close();
                ctx.render();
              } catch (error) {
                toast(error.message, { kind: 'error', ms: 4200 });
              } finally {
                target.disabled = false;
              }
            },
          }),
        ),
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Schedule rows
// ---------------------------------------------------------------------------

function dateBlock(value) {
  const p = fmt.kstParts(value);
  if (!p) return h('span', { class: 'date-block' }, '—');
  return h(
    'span',
    { class: 'date-block', 'aria-hidden': 'true' },
    h('b', null, String(Number(p.month))),
    h('span', null, `${Number(p.day)}일`),
  );
}

function matchRow(match, rows, onOpen, { past = false, onEdit = null } = {}) {
  const mine = myRow(rows);
  const d = dday(match.kickoff_at);
  const children = [
    dateBlock(match.kickoff_at),
    h(
      'div',
      { class: 'member-main' },
      h(
        'span',
        { class: 'member-name' },
        match.title,
        !past && d.text ? h('span', { class: 'me-tag' }, d.text) : null,
      ),
      h(
        'span',
        { class: 'member-meta' },
        `${fmt.formatKickoff(match.kickoff_at)} · ${match.pitch_name || '구장 미정'}`,
      ),
    ),
    past
      ? matchStatusBadge(match.status, fmt.MATCH_STATUS_LABEL[match.status] || match.status)
      : mine
        ? badge(fmt.lateText(mine.status, mine.late_eta_min), fmt.RSVP_TONE[mine.status])
        : badge('미응답', 'muted'),
  ];

  if (!onEdit) {
    return h('button', { class: 'member-row', type: 'button', onclick: onOpen }, ...children, icon('chevron', { size: 17, className: 'chev' }));
  }

  // 운영진에게는 행 안에 수정 버튼을 둔다. 버튼 안에 버튼을 넣을 수 없어서
  // 행은 div + role=button으로 두고, 수정 버튼은 클릭을 멈춘다(stopPropagation).
  return h(
    'div',
    {
      class: 'member-row',
      role: 'button',
      tabindex: '0',
      onclick: onOpen,
      onkeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      },
    },
    ...children,
    h(
      'button',
      {
        class: 'icon-btn member-edit',
        type: 'button',
        'aria-label': `${match.title} 수정`,
        onclick: (event) => {
          event.stopPropagation();
          onEdit();
        },
      },
      icon('edit', { size: 16 }),
    ),
    icon('chevron', { size: 17, className: 'chev' }),
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

async function build(root, ctx) {
  const team = currentTeam();
  // 내 역할(팀장·매니저)은 팀원 목록에서 나오므로, 앱바의 [+ 경기]를 그리기 전에
  // 먼저 불러온다. 첫 화면에서도 권한이 있는 사람에게 버튼이 보이게.
  if (team) await loadMembers(team.id);

  const content = h('div', { class: 'content' });
  const screen = h(
    'div',
    { class: 'screen' },
    appHeader({
      title: '경기·투표',
      brand: true,
      subtitle: team ? `${team.name} · ${fmt.MODE_LABEL[team.mode] || team.mode}` : '팀을 먼저 만들어 주세요',
      right: [
        canManage() ? iconButton('plus', '경기 만들기', () => openCreateMatch(ctx)) : null,
        iconButton('refresh', '새로고침', () => {
          rsvpCache.clear();
          ctx.render();
        }),
      ],
    }),
    content,
  );

  if (!state.teams.length) {
    content.appendChild(
      noTeamState({
        iconName: 'whistle',
        title: '팀을 만들고 경기를 시작하세요',
        body: '6자리 초대코드로 팀원을 모으면 일정·참석 투표·라인업을 바로 쓸 수 있습니다.',
        onDone: () => ctx.render(),
      }),
    );
    return screen;
  }

  content.appendChild(teamSwitcher(() => ctx.render()));

  await loadMatches(team.id);
  const now = Date.now();
  const all = state.matches;
  const upcoming = all
    .filter((match) => match.status === 'scheduled' && new Date(match.kickoff_at).getTime() > now - 2 * 3_600_000)
    .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));
  const past = all.filter((match) => !upcoming.includes(match));

  await Promise.all(upcoming.slice(0, 4).map((match) => loadRsvps(match.id).catch(() => [])));

  const next = upcoming[0];
  if (next) {
    const rows = rsvpCache.get(next.id) || [];
    let saved = [];
    try {
      saved = (await matchesApi.lineups(next.id)) || [];
    } catch {
      saved = [];
    }
    content.appendChild(heroCard(next, team, canManage() ? () => openEditMatch(ctx, next) : null));
    content.appendChild(
      h(
        'div',
        { class: 'card vote-card' },
        voteControl(next, rows, () => ctx.render()),
        attendanceBlock(rows, () => openMatchSheet(next, ctx)),
        button(canManage() ? '투표 현황 · 라인업' : '경기 자세히', {
          block: true,
          kind: canManage() ? 'primary' : 'ghost',
          onClick: () => openMatchSheet(next, ctx),
        }),
      ),
    );
    content.appendChild(
      section(
        '라인업',
        h('span', { class: 'section-note' }, `${next.quarter_count}쿼터`),
        lineupCard({ match: next, rows, saved, onSaved: () => ctx.render(), showTitle: false }),
      ),
    );
  } else {
    content.appendChild(
      emptyState({
        iconName: 'calendar',
        title: '예정된 경기가 없습니다',
        body: canManage()
          ? '경기를 만들면 팀원에게 참석 투표가 열리고, 다음 경기 카드가 여기에 표시됩니다.'
          : '팀장이 경기를 만들면 여기에 표시됩니다.',
        actionLabel: canManage() ? '경기 만들기' : null,
        onAction: () => openCreateMatch(ctx),
      }),
    );
  }

  if (upcoming.length > 1) {
    content.appendChild(
      section(
        '다가오는 일정',
        h('span', { class: 'section-note' }, `${upcoming.length - 1}건`),
        h(
          'div',
          { class: 'list' },
          ...upcoming.slice(1).map((match) =>
            matchRow(match, rsvpCache.get(match.id) || [], () => openMatchSheet(match, ctx), {
              onEdit: canManage() ? () => openEditMatch(ctx, match) : null,
            }),
          ),
        ),
      ),
    );
  }

  if (past.length) {
    content.appendChild(
      section(
        '지난 경기',
        h('span', { class: 'section-note' }, `${past.length}건`),
        h(
          'div',
          { class: 'list' },
          ...past.slice(0, 12).map((match) =>
            matchRow(match, [], () => openMatchSheet(match, ctx), {
              past: true,
              onEdit: canManage() ? () => openEditMatch(ctx, match) : null,
            }),
          ),
        ),
      ),
    );
  }

  let pitchRows = [];
  try {
    pitchRows = (await pitchesApi.list(team.id)) || [];
  } catch {
    pitchRows = [];
  }
  content.appendChild(
    section(
      '구장',
      canManage()
        ? button('4점 등록', { kind: 'soft', size: 'sm', iconName: 'plus', onClick: () => openPitchForm(ctx) })
        : null,
      h(
        'div',
        { class: 'list' },
        ...(pitchRows.length
          ? pitchRows.map((pitch) =>
              h(
                'div',
                { class: 'list-row' },
                h('span', { class: 'list-row-icon' }, icon('ruler', { size: 17 })),
                h(
                  'div',
                  { class: 'list-row-main' },
                  h('span', { class: 'list-row-title' }, pitch.name),
                  h(
                    'span',
                    { class: 'list-row-sub' },
                    `${Number(pitch.width_m)}×${Number(pitch.height_m)}m · ${pitch.is_indoor ? '실내' : '야외'} · ${fmt.MODE_LABEL[pitch.mode] || pitch.mode}`,
                  ),
                ),
                badge('4점 완료', 'ok'),
              ),
            )
          : [
              h(
                'div',
                { class: 'list-row' },
                h('span', { class: 'list-row-icon tone-muted' }, icon('ruler', { size: 17 })),
                h(
                  'div',
                  { class: 'list-row-main' },
                  h('span', { class: 'list-row-title' }, '등록된 구장이 없습니다'),
                  h(
                    'span',
                    { class: 'list-row-sub' },
                    canManage() ? '4점 등록으로 구장을 추가하면 히트맵이 정확해집니다.' : '팀장이 구장을 등록하면 여기에 표시됩니다.',
                  ),
                ),
              ),
            ]),
      ),
    ),
  );

  if (canManage()) {
    content.appendChild(
      h(
        'p',
        { class: 'foot-note' },
        '경기 생성·마감·라인업은 팀장·매니저만 할 수 있습니다. GPS 기록은 폰·워치 앱에서 남기면 이 화면에 그대로 나타납니다.',
      ),
    );
  }

  return screen;
}

export async function renderHome(root, ctx) {
  root.classList.remove('auth-screen');
  await renderScreen(root, ctx, () => build(root, ctx));
}
