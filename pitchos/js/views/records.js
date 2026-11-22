// 기록 탭: 내 세션·쿼터 기록, 팀 공유 토글, 팀원 공유 기록 조회.
//
// The web client has no GPS recorder of its own: sessions arrive from the phone /
// watch apps. This screen reads them and controls the share flag, which defaults
// to off (migration 0005).

import { sessions as sessionsApi } from '../api.js';
import { state, loadMatches, loadMembers, currentTeam, memberMap } from '../store.js';
import * as fmt from '../lib/format.js';
import {
  h,
  mount,
  badge,
  button,
  openSheet,
  toast,
  emptyState,
  section,
  card,
  spinner,
  stat,
  crest,
  switchToggle,
  select,
} from '../ui.js';
import { appHeader, teamStrip, renderScreen, iconButton } from './common.js';
import { openCreateTeam, openJoinTeam } from './teamForms.js';

function quartersBySession(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (!map.has(row.session_id)) map.set(row.session_id, []);
    map.get(row.session_id).push(row);
  }
  for (const list of map.values()) list.sort((a, b) => a.quarter - b.quarter);
  return map;
}

function matchTitle(matchId) {
  if (!matchId) return '개인 연습';
  return state.matches.find((match) => match.id === matchId)?.title || '경기 기록';
}

function sessionLabel(session) {
  return matchTitle(session.match_id);
}

function sessionSub(session) {
  const parts = [fmt.formatDateTime(session.started_at)];
  if (session.is_indoor) parts.push('실내');
  parts.push(session.record_source === 'watch' ? '워치' : session.record_source === 'both' ? '워치+폰' : '폰');
  return parts.join(' · ');
}

function quarterTable(rows) {
  if (!rows?.length) return h('p', { class: 'muted small' }, '쿼터 기록이 없습니다.');
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'stat-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, '쿼터'),
          h('th', null, '거리'),
          h('th', null, 'm/min'),
          h('th', null, '최고'),
          h('th', null, '스프린트'),
          h('th', null, '심박'),
        ),
      ),
      h(
        'tbody',
        null,
        ...rows.map((row) =>
          h(
            'tr',
            { class: row.is_rest ? 'is-rest' : null },
            h('td', null, row.is_rest ? `${row.quarter}Q 휴식` : `${row.quarter}Q`),
            h('td', null, fmt.formatMeters(row.distance_m)),
            h('td', null, row.is_rest ? '—' : fmt.formatNumber(row.distance_per_min, 1)),
            h('td', null, row.is_rest ? '—' : `${fmt.formatNumber(row.top_speed_kmh, 1)}`),
            h('td', null, row.is_rest ? '—' : fmt.formatNumber(row.sprint_count)),
            h(
              'td',
              null,
              row.avg_heart_rate
                ? `${fmt.formatNumber(row.avg_heart_rate)}/${fmt.formatNumber(row.max_heart_rate)}`
                : '—',
            ),
          ),
        ),
      ),
    ),
  );
}

function openSessionSheet(session, quarters, onChange) {
  const sheet = openSheet({
    title: sessionLabel(session),
    subtitle: fmt.formatDateTime(session.started_at),
    render: (body) => {
      const share = switchToggle({
        checked: session.share_with_team,
        label: '팀에 공유',
        onChange: async (next) => {
          try {
            await sessionsApi.setShare(session.id, next);
            session.share_with_team = next;
            toast(next ? '팀원에게 공유합니다.' : '공유를 껐습니다.', { kind: 'ok' });
            onChange?.();
          } catch (error) {
            toast(error.message, { kind: 'error', ms: 4000 });
            return false;
          }
          return true;
        },
      });

      const totals = fmt.sumQuarters(quarters);
      mount(
        body,
        h(
          'div',
          { class: 'stack' },
          card(
            h('div', { class: 'stat-grid' },
              stat('이동 거리', fmt.formatMeters(totals.distance_m)),
              stat('쿼터', `${totals.quarters}`, { unit: '개' }),
              stat('최고 속도', fmt.formatNumber(totals.top_speed_kmh, 1), { unit: 'km/h' }),
              stat('스프린트', fmt.formatNumber(totals.sprint_count), { unit: '회' }),
            ),
            h(
              'div',
              { class: 'info-row' },
              h('span', { class: 'info-label' }, '기록 시간'),
              h('span', { class: 'info-value' }, fmt.formatDuration(totals.active_seconds)),
            ),
            h(
              'div',
              { class: 'info-row' },
              h('span', { class: 'info-label' }, '동기화'),
              h('span', { class: 'info-value' }, fmt.SYNC_POLICY_LABEL[session.sync_policy] || session.sync_policy),
            ),
            h(
              'div',
              { class: 'info-row' },
              h('span', { class: 'info-label' }, '측정 포인트'),
              h('span', { class: 'info-value' }, `${fmt.formatNumber(session.point_count)}개`),
            ),
            h(
              'div',
              { class: 'list-row' },
              h(
                'div',
                { class: 'list-row-main' },
                h('span', { class: 'list-row-title' }, '팀원에게 공유'),
                h('span', { class: 'list-row-sub' }, '기본은 비공개입니다. 켜면 같은 경기의 팀원이 집계 지표를 볼 수 있습니다.'),
              ),
              share,
            ),
          ),
          section('쿼터별 기록', null, quarterTable(quarters)),
          h(
            'p',
            { class: 'hint-box' },
            '히트맵·리플레이는 폰·워치 앱에서 볼 수 있습니다. 웹에서는 쿼터 지표와 공유 설정을 확인합니다.',
          ),
        ),
      );
    },
  });
  return sheet;
}

async function teamSharedSection(ctx) {
  const matches = state.matches.filter((match) => match.status !== 'scheduled').slice(0, 15);
  if (!matches.length) {
    return section(
      '팀 공유 기록',
      null,
      h('p', { class: 'muted small pad' }, '지난 경기가 생기면 팀원이 공유한 기록을 여기서 볼 수 있습니다.'),
    );
  }

  const holder = h('div', { class: 'stack' });
  const picker = select({
    label: '경기 선택',
    value: matches[0].id,
    options: matches.map((match) => ({
      value: match.id,
      label: `${fmt.formatMonthDay(match.kickoff_at)} ${match.title}`,
    })),
  });

  async function load() {
    mount(holder, spinner('공유 기록을 불러오는 중…'));
    try {
      const rows = (await sessionsApi.forMatch(picker.value)) || [];
      const names = memberMap();
      const others = rows.filter((row) => row.user_id !== state.profile?.id);
      const mine = rows.filter((row) => row.user_id === state.profile?.id);

      if (!rows.length) {
        mount(holder, h('p', { class: 'muted small pad' }, '아직 이 경기의 기록이 없습니다.'));
        return;
      }
      mount(
        holder,
        ...[
          mine.length
            ? h('div', { class: 'card-tight' },
                h('p', { class: 'list-group-label' }, '내 기록'),
                ...mine.map((row) =>
                  h(
                    'div',
                    { class: 'list-row' },
                    crest(state.profile.display_name || 'P', { size: 32 }),
                    h('div', { class: 'list-row-main' },
                      h('span', { class: 'list-row-title' }, state.profile.display_name || '나'),
                      h('span', { class: 'list-row-sub' }, fmt.formatDateTime(row.started_at)),
                    ),
                    badge(row.share_with_team ? '공유 중' : '비공개', row.share_with_team ? 'ok' : 'muted'),
                  ),
                ),
              )
            : null,
          h('div', { class: 'card-tight' },
            h('p', { class: 'list-group-label' }, '팀원 공유 기록'),
            ...(others.length
              ? others.map((row) =>
                  h(
                    'div',
                    { class: 'list-row' },
                    crest(names.get(row.user_id)?.display_name || '팀원', { size: 32 }),
                    h('div', { class: 'list-row-main' },
                      h('span', { class: 'list-row-title' }, names.get(row.user_id)?.display_name || '팀원'),
                      h('span', { class: 'list-row-sub' }, fmt.formatDateTime(row.started_at)),
                    ),
                    badge(row.is_indoor ? '실내' : '야외', 'muted'),
                  ),
                )
              : [h('p', { class: 'muted small pad' }, '공유를 켠 팀원 기록이 아직 없습니다. (공유는 각자 기록에서 켭니다)')]),
          ),
        ].filter(Boolean),
      );
    } catch (error) {
      mount(holder, h('p', { class: 'muted small pad' }, error.message));
    }
  }

  picker.input.addEventListener('change', load);
  const wrapper = h('div', { class: 'stack' }, picker.el, holder);
  load();
  return section('팀 공유 기록', null, wrapper);
}

async function build(root, ctx) {
  const header = appHeader({
    title: '기록',
    subtitle: currentTeam() ? `${currentTeam().name} · 내 기록` : '내 기록',
    right: [iconButton('refresh', '새로고침', () => ctx.render())],
  });
  const content = h('div', { class: 'content' });
  const screen = h('div', { class: 'screen' }, header, teamStrip(() => ctx.render()), content);

  if (!state.teams.length) {
    content.appendChild(
      emptyState({
        iconName: 'chart',
        title: '기록이 없습니다',
        body: '폰·워치 앱에서 경기를 기록하면 거리·속도·쿼터 지표가 여기에 쌓입니다.',
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

  await Promise.all([loadMembers(), loadMatches()]);

  const userId = state.profile.id;
  const sessions = (await sessionsApi.mine(userId)) || [];
  const quarterRows = sessions.length
    ? await sessionsApi.quartersFor(sessions.slice(0, 30).map((session) => session.id))
    : [];
  const bySession = quartersBySession(quarterRows);

  const totals = sessions.reduce(
    (acc, session) => {
      const sum = fmt.sumQuarters(bySession.get(session.id));
      acc.distance += sum.distance_m;
      acc.quarters += sum.quarters;
      return acc;
    },
    { distance: 0, quarters: 0 },
  );

  if (!sessions.length) {
    content.appendChild(
      emptyState({
        iconName: 'chart',
        title: '아직 내 기록이 없습니다',
        body: '폰 단독 또는 워치로 경기를 기록하면 여기에 나타납니다. 기록은 저장·열람·공유 모두 무료입니다.',
      }),
    );
  } else {
    content.appendChild(
      card(
        h('div', { class: 'stat-grid' },
          stat('누적 기록', `${fmt.formatNumber(sessions.length)}`, { unit: '회' }),
          stat('총 거리', fmt.formatMeters(totals.distance)),
          stat('쿼터', `${fmt.formatNumber(totals.quarters)}`, { unit: '개' }),
        ),
        h('p', { class: 'hint-box' }, '공유를 켠 기록만 팀원에게 보입니다. 기본값은 비공개입니다.'),
      ),
    );

    content.appendChild(
      section(
        '내 세션',
        h('span', { class: 'section-note' }, `${sessions.length}건`),
        h(
          'div',
          { class: 'card-tight' },
          ...sessions.map((session) => {
            const quarters = bySession.get(session.id) || [];
            const sum = fmt.sumQuarters(quarters);
            return h(
              'div',
              { class: 'session-row' },
              h(
                'button',
                {
                  class: 'session-main',
                  type: 'button',
                  onclick: () => openSessionSheet(session, quarters, () => ctx.render()),
                },
                h('div', { class: 'session-top' },
                  h('span', { class: 'session-title' }, sessionLabel(session)),
                  h('span', { class: 'session-date' }, fmt.formatMonthDay(session.started_at)),
                ),
                h('div', { class: 'session-meta' }, sessionSub(session)),
                h('div', { class: 'session-stats' },
                  h('span', null, fmt.formatMeters(sum.distance_m)),
                  h('span', null, `${sum.quarters}쿼터`),
                  sum.top_speed_kmh ? h('span', null, `${fmt.formatNumber(sum.top_speed_kmh, 1)} km/h`) : null,
                ),
              ),
              switchToggle({
                checked: session.share_with_team,
                label: '팀 공유',
                onChange: async (next) => {
                  try {
                    await sessionsApi.setShare(session.id, next);
                    session.share_with_team = next;
                    toast(next ? '팀원에게 공유합니다.' : '공유를 껐습니다.', { kind: 'ok' });
                  } catch (error) {
                    toast(error.message, { kind: 'error', ms: 4000 });
                    ctx.render();
                  }
                },
              }),
            );
          }),
        ),
      ),
    );
  }

  content.appendChild(await teamSharedSection(ctx));
  return screen;
}

export async function renderRecords(root, ctx) {
  root.classList.remove('auth-screen');
  await renderScreen(root, ctx, () => build(root, ctx));
}
