// 홈(경기·투표) 탭: 일정, 참석 투표와 마감, 라인업, 구장 4점 등록.
//
// Every write goes through the RPCs the native apps use (create_match,
// upsert_rsvp, finalize_rsvp, replace_lineup); the server decides ownership,
// the deadline and whether a vote is still open.

import { matches as matchesApi, pitches as pitchesApi } from '../api.js';
import {
  state,
  loadMatches,
  loadMembers,
  currentTeam,
  canManage,
  memberMap,
} from '../store.js';
import * as fmt from '../lib/format.js';
import { draftLineup, PER_SIDE, groupByQuarter } from '../lib/lineup.js';
import {
  h,
  mount,
  badge,
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
  input,
  select,
  checkbox,
} from '../ui.js';
import { appHeader, teamStrip, renderScreen, iconButton } from './common.js';
import { openCreateTeam, openJoinTeam } from './teamForms.js';

const rsvpCache = new Map();

async function loadRsvps(matchId, force = false) {
  if (!force && rsvpCache.has(matchId)) return rsvpCache.get(matchId);
  const rows = (await matchesApi.rsvps(matchId)) || [];
  rsvpCache.set(matchId, rows);
  return rows;
}

function counts(rows) {
  const out = { going: 0, late: 0, maybe: 0, declined: 0, no_response: 0 };
  for (const row of rows) out[row.status] = (out[row.status] || 0) + 1;
  return out;
}

function attending(rows) {
  return rows.filter((row) => row.status === 'going' || row.status === 'late');
}

function myRow(rows) {
  const uid = state.profile?.id;
  return rows.find((row) => row.user_id === uid) || null;
}

function isClosed(match) {
  return fmt.deadlineState(match.rsvp_deadline_at).closed;
}

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

const VOTE_CHOICES = [
  { status: 'going', label: '참석', tone: 'ok' },
  { status: 'late', label: '지각', tone: 'warn' },
  { status: 'maybe', label: '미정', tone: 'muted' },
  { status: 'declined', label: '불참', tone: 'bad' },
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
            { class: 'eta-grid' },
            ...options.map((minutes) =>
              h(
                'button',
                {
                  class: `eta-btn${current === minutes ? ' is-active' : ''}`,
                  type: 'button',
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
          h('p', { class: 'hint-box' }, '나중에 다시 눌러 언제든 바꿀 수 있습니다. 마감 시각이 지나면 잠깁니다.'),
        ),
      );
    },
  });
}

function voteControl(match, rows, onChange, { compact = false } = {}) {
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
      active ? icon('check', { size: 15 }) : null,
      label,
    );
  });

  return h(
    'div',
    { class: `vote-block${compact ? ' compact' : ''}` },
    h('div', { class: 'vote-seg' }, ...buttons),
    closed
      ? h('p', { class: 'vote-note' }, '투표가 마감되었습니다.')
      : mine
        ? h('p', { class: 'vote-note' }, `내 투표: ${fmt.lateText(mine.status, mine.late_eta_min)} · ${fmt.deadlineState(match.rsvp_deadline_at).text}`)
        : h('p', { class: 'vote-note' }, '아직 투표하지 않았습니다.'),
  );
}

// ---------------------------------------------------------------------------
// Match detail sheet
// ---------------------------------------------------------------------------

function infoRows(match, team) {
  const rows = [
    ['일시', fmt.formatKickoff(match.kickoff_at)],
    ['구장', match.pitch_name || '구장 미정'],
    ['쿼터', `${match.quarter_count}쿼터 × ${match.quarter_minutes}분`],
    ['방식', match.is_indoor ? '실내 (위치 기록 없음)' : '야외 (GPS 기록)'],
    ['종목', fmt.MODE_LABEL[match.mode] || match.mode],
    ['종류', match.kind === 'practice' ? '팀 연습' : '경기'],
    ['마감', match.rsvp_deadline_at ? fmt.formatDateTime(match.rsvp_deadline_at) : '마감 없음'],
    ['상태', fmt.MATCH_STATUS_LABEL[match.status] || match.status],
  ];
  return rows;
}

function lineupSection(match, rsvps, saved, refresh) {
  const names = memberMap();
  let draft = null;
  const holder = h('div', { class: 'stack' });
  const going = attending(rsvps);

  function draw() {
    const rows = draft || saved;
    const grouped = groupByQuarter(rows);
    const manager = canManage();

    const parts = [];
    if (grouped.size === 0) {
      parts.push(h('p', { class: 'muted small' }, '저장된 라인업이 없습니다.'));
    } else {
      parts.push(
        h(
          'div',
          { class: 'lineup-grid' },
          ...[...grouped.entries()].map(([quarter, list]) =>
            h(
              'div',
              { class: 'quarter-row' },
              h('span', { class: 'quarter-label' }, `${quarter}Q`),
              h(
                'div',
                { class: 'quarter-players' },
                ...list.map((row) =>
                  h(
                    'span',
                    { class: 'player-chip' },
                    names.get(row.user_id)?.display_name || '팀원',
                    row.position ? h('small', null, ` ${row.position}`) : null,
                  ),
                ),
              ),
            ),
          ),
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
          { class: 'btn-row' },
          button(draft ? '다시 배분' : '자동 배분 초안', {
            kind: 'ghost',
            block: true,
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
              draw();
            },
          }),
          draft
            ? button('라인업 저장', {
                block: true,
                onClick: async () => {
                  try {
                    const savedCount = await matchesApi.saveLineup(match.id, draft);
                    toast(`${savedCount}개 배치를 저장했습니다.`, { kind: 'ok' });
                    draft = null;
                    await refresh();
                  } catch (error) {
                    toast(error.message, { kind: 'error', ms: 4200 });
                  }
                },
              })
            : null,
        ),
      );
      if (going.length === 0) {
        parts.push(h('p', { class: 'hint-box' }, '참석·지각으로 투표한 팀원이 있어야 초안을 만들 수 있습니다.'));
      }
    }

    holder.replaceChildren(...parts.filter(Boolean));
  }

  draw();
  return holder;
}

async function openMatchSheet(match, ctx) {
  const sheet = openSheet({
    title: match.title,
    subtitle: fmt.formatKickoff(match.kickoff_at),
    render: async (body) => {
      async function draw() {
        mount(body, spinner('경기 정보를 불러오는 중…'));
        const [rsvps, lineups] = await Promise.all([
          loadRsvps(match.id, true),
          matchesApi.lineups(match.id),
        ]);
        const counts_ = counts(rsvps);
        const manager = canManage();
        const closed = isClosed(match);
        const names = memberMap();

        const summary = [
          ['참석', counts_.going, 'ok'],
          ['지각', counts_.late, 'warn'],
          ['미정', counts_.maybe, 'muted'],
          ['불참', counts_.declined, 'bad'],
        ];

        mount(
          body,
          h(
            'div',
            { class: 'stack' },
            card(
              ...infoRows(match).map(([label, value]) =>
                h('div', { class: 'info-row' }, h('span', { class: 'info-label' }, label), h('span', { class: 'info-value' }, value)),
              ),
            ),
            card(
              h('h3', { class: 'card-title' }, '내 투표'),
              voteControl(match, rsvps, draw),
              h(
                'div',
                { class: 'count-row' },
                ...summary.map(([label, value, tone]) => h('span', { class: `count-pill tone-${tone}` }, `${label} ${value}`)),
              ),
            ),
            manager
              ? card(
                  h('h3', { class: 'card-title' }, '관리자'),
                  h(
                    'div',
                    { class: 'btn-row' },
                    button('투표 마감', {
                      kind: closed ? 'primary' : 'ghost',
                      block: true,
                      disabled: !closed,
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
                          // Redraw the list behind the sheet so the card shows the closed vote.
                          void ctx.render();
                        } catch (error) {
                          toast(error.message, { kind: 'error', ms: 4200 });
                        }
                      },
                    }),
                  ),
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
                { class: 'card-tight rsvp-list' },
                ...(rsvps.length
                  ? rsvps
                      .slice()
                      .sort((a, b) => {
                        const order = { going: 0, late: 1, maybe: 2, declined: 3, no_response: 4 };
                        return (order[a.status] ?? 5) - (order[b.status] ?? 5);
                      })
                      .map((row) =>
                        h(
                          'div',
                          { class: 'rsvp-row' },
                          crest(row.display_name || 'P', { size: 32 }),
                          h(
                            'div',
                            { class: 'rsvp-main' },
                            h('span', { class: 'rsvp-name' }, row.display_name, row.user_id === state.profile?.id ? h('span', { class: 'me-tag' }, '나') : null),
                            h('span', { class: 'rsvp-sub' }, [fmt.ROLE_LABEL[row.role] || row.role, row.position].filter(Boolean).join(' · ')),
                          ),
                          badge(fmt.lateText(row.status, row.late_eta_min), fmt.RSVP_TONE[row.status] || 'muted'),
                        ),
                      )
                  : [h('p', { class: 'muted small' }, '아직 투표한 팀원이 없습니다.')]),
              ),
            ),
            section(
              `라인업 (${match.quarter_count}쿼터)`,
              canManage() ? h('span', { class: 'section-note' }, '자동 배분 후 저장') : null,
              lineupSection(match, rsvps, lineups || [], draw),
            ),
          ),
        );
      }
      try {
        await draw();
      } catch (error) {
        mount(body, h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, '불러오지 못했습니다'), h('p', { class: 'empty-body' }, error.message)));
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
  const kind = select({
    label: '종류',
    value: 'match',
    options: [
      { value: 'match', label: '경기 (상대 팀)' },
      { value: 'practice', label: '팀 연습' },
    ],
  });
  const kickoff = input({
    label: '경기 일시',
    type: 'datetime-local',
    value: nextSaturdayEvening(),
    hint: '투표는 경기 48시간 전 22시(한국시간)에 자동 마감됩니다.',
  });
  const opponent = input({ label: '상대 팀 이름', placeholder: '예: 화이트울브스', maxlength: 40 });
  const pitchName = input({ label: '구장 이름', placeholder: '예: 강남 풋살파크 A구장', maxlength: 60 });
  const indoor = checkbox({ label: '실내 구장 (GPS 없이 시간·심박만 기록)', checked: false });
  const quarterCount = select({
    label: '쿼터 수',
    value: '4',
    options: [2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n}쿼터` })),
  });
  const quarterMinutes = select({
    label: '쿼터 시간',
    value: '12',
    options: [8, 10, 12, 15, 20, 25].map((n) => ({ value: String(n), label: `${n}분` })),
  });

  const sheet = openSheet({
    title: '경기 만들기',
    subtitle: `${team.name} · ${fmt.MODE_LABEL[team.mode] || team.mode}`,
    render: (body) => {
      const toggleOpponent = () => {
        opponent.el.style.display = kind.value === 'practice' ? 'none' : '';
      };
      kind.input.addEventListener('change', toggleOpponent);
      toggleOpponent();

      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          kind.el,
          kickoff.el,
          opponent.el,
          pitchName.el,
          h('div', { class: 'field-row' }, quarterCount.el, quarterMinutes.el),
          indoor.el,
          button('경기 만들기', {
            block: true,
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
              target.disabled = true;
              try {
                await matchesApi.create({
                  teamId: team.id,
                  kind: kind.value,
                  kickoff: iso,
                  pitchName: pitchName.value.trim(),
                  indoor: indoor.checked,
                  quarterCount: Number(quarterCount.value),
                  quarterMinutes: Number(quarterMinutes.value),
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
  const width = input({ label: '폭 (골대에서 골대까지, m)', type: 'number', value: defaults.w, min: 10, max: 130, step: '0.5' });
  const height = input({ label: '길이 (터치라인, m)', type: 'number', value: defaults.h, min: 10, max: 100, step: '0.5' });
  const indoor = checkbox({ label: '실내 구장', checked: false });

  const cornerFields = CORNERS.map((corner) => {
    const lat = input({ label: `${corner.label} 위도`, type: 'number', step: '0.000001', inputmode: 'decimal', placeholder: '37.5...' });
    const lon = input({ label: `${corner.label} 경도`, type: 'number', step: '0.000001', inputmode: 'decimal', placeholder: '127.0...' });
    const here = button('현재 위치', {
      kind: 'ghost',
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
    subtitle: '골대 뒤 왼쪽부터 시계 방향으로 4개 꼭짓점을 찍습니다.',
    render: (body) => {
      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          h('p', { class: 'hint-box' }, '내 골대 뒤 왼쪽 → 오른쪽 → 상대 골대 오른쪽 → 왼쪽 순서로, 구장 네 귀퉁이에 서서 [현재 위치]를 누르면 정확합니다.'),
          name.el,
          h('div', { class: 'field-row' }, width.el, height.el),
          indoor.el,
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
            onClick: async (event) => {
              const target = event.currentTarget;
              const title = name.value.trim();
              const w = Number(width.value);
              const hgt = Number(height.value);
              if (!title) return toast('구장 이름을 입력해 주세요.', { kind: 'error' });
              if (!(w >= 10 && w <= 130)) return toast('폭은 10~130m 사이여야 합니다.', { kind: 'error' });
              if (!(hgt >= 10 && hgt <= 100)) return toast('길이는 10~100m 사이여야 합니다.', { kind: 'error' });

              const body_ = {
                team_id: team.id,
                name: title,
                mode: team.mode,
                width_m: w,
                height_m: hgt,
                is_indoor: indoor.checked,
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
                body_[`corner_${corner.key}_lat`] = lat;
                body_[`corner_${corner.key}_lon`] = lon;
              }

              target.disabled = true;
              try {
                await pitchesApi.create(body_);
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
// Screen
// ---------------------------------------------------------------------------

async function build(root, ctx) {
  const team = currentTeam();
  const content = h('div', { class: 'content' });
  const header = appHeader({
    title: '경기·투표',
    subtitle: team ? `${team.name} · ${fmt.MODE_LABEL[team.mode] || team.mode}` : '팀을 먼저 만들어 주세요',
    right: [
      canManage() ? iconButton('plus', '경기 만들기', () => openCreateMatch(ctx)) : null,
      iconButton('refresh', '새로고침', () => {
        rsvpCache.clear();
        ctx.render();
      }),
    ],
  });
  const screen = h('div', { class: 'screen' }, header, teamStrip(() => ctx.render()), content);

  if (!state.teams.length) {
    content.appendChild(
      emptyState({
        iconName: 'whistle',
        title: '팀이 있어야 경기를 만들 수 있습니다',
        body: '팀을 만들면 6자리 초대코드로 팀원을 모으고, 경기 일정과 참석 투표를 시작할 수 있습니다.',
      }),
    );
    content.appendChild(
      h(
        'div',
        { class: 'btn-row' },
        button('팀 만들기', { block: true, onClick: () => openCreateTeam({ onDone: () => ctx.render() }) }),
        button('초대코드로 참여', { block: true, kind: 'ghost', onClick: () => openJoinTeam({ onDone: () => ctx.render() }) }),
      ),
    );
    return screen;
  }

  await Promise.all([loadMembers(team.id), loadMatches(team.id)]);
  const now = Date.now();
  const all = state.matches;
  const upcoming = all
    .filter((match) => match.status === 'scheduled' && new Date(match.kickoff_at).getTime() > now - 2 * 3_600_000)
    .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));
  const past = all.filter((match) => !upcoming.includes(match));

  // Vote tallies for the next few matches, so the list shows real numbers.
  await Promise.all(upcoming.slice(0, 4).map((match) => loadRsvps(match.id).catch(() => [])));

  const next = upcoming[0];
  if (next) {
    const rows = rsvpCache.get(next.id) || [];
    const c = counts(rows);
    const deadline = fmt.deadlineState(next.rsvp_deadline_at);
    content.appendChild(
      card(
        h(
          'div',
          { class: 'hero-head' },
          h('div', { class: 'hero-tags' },
            badge(next.kind === 'practice' ? '팀 연습' : '경기', 'primary'),
            badge(deadline.text, deadline.tone === 'closed' ? 'muted' : deadline.tone === 'soon' ? 'warn' : 'ok'),
          ),
          h('h2', { class: 'hero-title' }, next.title),
          h('p', { class: 'hero-meta' },
            h('span', null, fmt.formatKickoff(next.kickoff_at)),
            h('span', { class: 'dot' }, '·'),
            h('span', null, next.pitch_name || '구장 미정'),
          ),
        ),
        h(
          'div',
          { class: 'count-row' },
          h('span', { class: 'count-pill tone-ok' }, `참석 ${c.going}`),
          h('span', { class: 'count-pill tone-warn' }, `지각 ${c.late}`),
          h('span', { class: 'count-pill tone-muted' }, `미정 ${c.maybe}`),
          h('span', { class: 'count-pill tone-bad' }, `불참 ${c.declined}`),
        ),
        voteControl(next, rows, () => ctx.render()),
        h(
          'div',
          { class: 'btn-row' },
          button(canManage() ? '투표 현황·라인업' : '경기 자세히', {
            kind: canManage() ? 'primary' : 'ghost',
            block: true,
            onClick: () => openMatchSheet(next, ctx),
          }),
        ),
      ),
    );
  } else {
    content.appendChild(
      emptyState({
        iconName: 'calendar',
        title: '예정된 경기가 없습니다',
        body: canManage() ? '경기를 만들면 팀원에게 참석 투표가 열립니다.' : '팀장이 경기를 만들면 여기에 표시됩니다.',
        actionLabel: canManage() ? '경기 만들기' : null,
        onAction: () => openCreateMatch(ctx),
      }),
    );
  }

  if (upcoming.length > 1) {
    content.appendChild(
      section(
        '다음 일정',
        null,
        h(
          'div',
          { class: 'card-tight' },
          ...upcoming.slice(1).map((match) => {
            const rows = rsvpCache.get(match.id) || [];
            const mine = myRow(rows);
            return h(
              'button',
              { class: 'list-row', type: 'button', onclick: () => openMatchSheet(match, ctx) },
              h(
                'div',
                { class: 'list-row-main' },
                h('span', { class: 'list-row-title' }, match.title),
                h('span', { class: 'list-row-sub' }, `${fmt.formatKickoff(match.kickoff_at)} · ${match.pitch_name || '구장 미정'}`),
              ),
              mine ? badge(fmt.lateText(mine.status, mine.late_eta_min), fmt.RSVP_TONE[mine.status]) : badge('미응답', 'muted'),
              icon('chevron', { size: 18, className: 'chev' }),
            );
          }),
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
          { class: 'card-tight' },
          ...past.slice(0, 12).map((match) =>
            h(
              'button',
              { class: 'list-row', type: 'button', onclick: () => openMatchSheet(match, ctx) },
              h(
                'div',
                { class: 'list-row-main' },
                h('span', { class: 'list-row-title' }, match.title),
                h('span', { class: 'list-row-sub' }, `${fmt.formatDateTime(match.kickoff_at)} · ${match.pitch_name || '구장 미정'}`),
              ),
              badge(fmt.MATCH_STATUS_LABEL[match.status] || match.status, 'muted'),
              icon('chevron', { size: 18, className: 'chev' }),
            ),
          ),
        ),
      ),
    );
  }

  // Pitches
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
        ? button('4점 등록', { kind: 'ghost', size: 'sm', iconName: 'plus', onClick: () => openPitchForm(ctx) })
        : null,
      h(
        'div',
        { class: 'card-tight' },
        ...(pitchRows.length
          ? pitchRows.map((pitch) =>
              h(
                'div',
                { class: 'list-row' },
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
          : [h('p', { class: 'muted small pad' }, canManage() ? '등록된 구장이 없습니다. [4점 등록]으로 추가해 주세요.' : '등록된 구장이 없습니다.')]),
      ),
    ),
  );

  if (canManage()) {
    content.appendChild(
      h(
        'p',
        { class: 'foot-note' },
        '경기 생성·마감·라인업은 팀장·매니저만 할 수 있습니다. 기록은 폰·워치 앱에서 남기면 이 화면에 그대로 나타납니다.',
      ),
    );
  }

  return screen;
}

export async function renderHome(root, ctx) {
  root.classList.remove('auth-screen');
  await renderScreen(root, ctx, () => build(root, ctx));
}
