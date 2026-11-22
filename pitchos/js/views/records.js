// 기록 탭: 핵심 지표, 쿼터별 비교, 공유 토글, 팀원 공유 기록.
//
// 이 웹은 GPS를 기록하지 않는다. 세션은 폰·워치 앱이 남기고, 웹은 읽기와
// 공유 설정만 담당한다(기본값은 비공개).

import { sessions as sessionsApi } from '../api.js';
import { state, loadMatches, loadMembers, currentTeam, memberMap } from '../store.js';
import * as fmt from '../lib/format.js';
import {
  h,
  badge,
  button,
  crest,
  openSheet,
  toast,
  emptyState,
  section,
  spinner,
  statTile,
  barChart,
  switchToggle,
  chip,
  mount,
} from '../ui.js';
import { appHeader, teamSwitcher, renderScreen, iconButton, noTeamState } from './common.js';

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
            h('td', null, row.is_rest ? '—' : fmt.formatNumber(row.top_speed_kmh, 1)),
            h('td', null, row.is_rest ? '—' : fmt.formatNumber(row.sprint_count)),
            h(
              'td',
              null,
              row.avg_heart_rate ? `${fmt.formatNumber(row.avg_heart_rate)}/${fmt.formatNumber(row.max_heart_rate)}` : '—',
            ),
          ),
        ),
      ),
    ),
  );
}

function openSessionSheet(session, quarters, onChange) {
  const sheet = openSheet({
    title: matchTitle(session.match_id),
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
          }
        },
      });

      const totals = fmt.sumQuarters(quarters);
      mount(
        body,
        h(
          'div',
          { class: 'stack' },
          h(
            'div',
            { class: 'kpi-grid' },
            statTile({ label: '이동 거리', value: fmt.formatMeters(totals.distance_m), iconName: 'activity' }),
            statTile({ label: '쿼터', value: String(totals.quarters), unit: '개', iconName: 'flag', tone: 'green' }),
            statTile({ label: '최고 속도', value: fmt.formatNumber(totals.top_speed_kmh, 1), unit: 'km/h', iconName: 'clock' }),
            statTile({ label: '스프린트', value: fmt.formatNumber(totals.sprint_count), unit: '회', iconName: 'trophy', tone: 'amber' }),
          ),
          h(
            'div',
            { class: 'card card-flush' },
            h('div', { class: 'info-row' }, h('span', { class: 'info-label' }, '기록 시간'), h('span', { class: 'info-value' }, fmt.formatDuration(totals.active_seconds))),
            h('div', { class: 'info-row' }, h('span', { class: 'info-label' }, '동기화'), h('span', { class: 'info-value' }, fmt.SYNC_POLICY_LABEL[session.sync_policy] || session.sync_policy)),
            h('div', { class: 'info-row' }, h('span', { class: 'info-label' }, '측정 포인트'), h('span', { class: 'info-value' }, `${fmt.formatNumber(session.point_count)}개`)),
            h(
              'div',
              { class: 'share-row' },
              h(
                'div',
                { class: 'share-row-main' },
                h('span', { class: 'share-title' }, '팀원에게 공유'),
                h('span', { class: 'share-sub' }, '켜면 같은 경기의 팀원이 집계 지표를 봅니다.'),
              ),
              share,
            ),
          ),
          section('쿼터별 기록', null, quarterTable(quarters)),
          h('p', { class: 'hint-box' }, '히트맵·리플레이는 폰·워치 앱에서 볼 수 있습니다. 웹에서는 쿼터 지표와 공유 설정을 확인합니다.'),
        ),
      );
    },
  });
  return sheet;
}

// ---------------------------------------------------------------------------
// Team shared feed
// ---------------------------------------------------------------------------

async function teamSharedSection(ctx) {
  const matches = state.matches.filter((match) => match.status !== 'scheduled').slice(0, 12);
  if (!matches.length) {
    return section(
      '팀 공유 기록',
      null,
      h('p', { class: 'hint-box' }, '지난 경기가 생기면 팀원이 공유한 기록을 여기서 볼 수 있습니다.'),
    );
  }

  let selected = matches[0].id;
  const chipRow = h('div', { class: 'chip-row' });
  const holder = h('div', { class: 'list' });

  function drawChips() {
    chipRow.replaceChildren(
      ...matches.map((match) =>
        h(
          'button',
          {
            class: `chip${match.id === selected ? ' is-active' : ''}`,
            type: 'button',
            onclick: () => {
              selected = match.id;
              drawChips();
              load();
            },
          },
          fmt.formatMonthDay(match.kickoff_at),
          h('span', { class: 'chip-count' }, match.title),
        ),
      ),
    );
  }

  async function load() {
    mount(holder, h('p', { class: 'muted small pad' }, '공유 기록을 불러오는 중…'));
    try {
      const rows = (await sessionsApi.forMatch(selected)) || [];
      const names = memberMap();
      if (!rows.length) {
        holder.replaceChildren(h('p', { class: 'muted small pad' }, '아직 이 경기의 기록이 없습니다.'));
        return;
      }
      holder.replaceChildren(
        ...rows.map((row) => {
          const mine = row.user_id === state.profile?.id;
          const name = mine ? state.profile?.display_name || '나' : names.get(row.user_id)?.display_name || '팀원';
          return h(
            'div',
            { class: 'member-row' },
            crest(name, { size: 34, tone: 'avatar' }),
            h(
              'div',
              { class: 'member-main' },
              h('span', { class: 'member-name' }, name, mine ? h('span', { class: 'me-tag' }, '나') : null),
              h('span', { class: 'member-meta' }, fmt.formatDateTime(row.started_at)),
            ),
            badge(
              row.share_with_team || mine ? (mine ? (row.share_with_team ? '공유 중' : '비공개') : '공유됨') : '공유됨',
              row.share_with_team || mine ? (row.share_with_team ? 'ok' : 'muted') : 'ok',
            ),
          );
        }),
      );
    } catch (error) {
      holder.replaceChildren(h('p', { class: 'muted small pad' }, error.message));
    }
  }

  drawChips();
  void load();
  return section('팀 공유 기록', null, chipRow, holder);
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

async function build(root, ctx) {
  const team = currentTeam();
  const header = appHeader({
    title: '기록',
    subtitle: team ? `${team.name} · 내 퍼포먼스` : '내 기록',
    right: [iconButton('refresh', '새로고침', () => ctx.render())],
  });
  const content = h('div', { class: 'content' });
  const screen = h('div', { class: 'screen' }, header, content);

  if (!state.teams.length) {
    content.appendChild(
      noTeamState({
        iconName: 'chart',
        title: '기록을 쌓아 보세요',
        body: '폰·워치 앱에서 경기를 기록하면 거리·속도·쿼터 지표가 여기에 모입니다.',
        onDone: () => ctx.render(),
      }),
    );
    return screen;
  }

  content.appendChild(teamSwitcher(() => ctx.render()));
  await Promise.all([loadMembers(), loadMatches()]);

  const userId = state.profile.id;
  const sessions = (await sessionsApi.mine(userId)) || [];
  const quarterRows = sessions.length
    ? await sessionsApi.quartersFor(sessions.slice(0, 30).map((session) => session.id))
    : [];
  const bySession = quartersBySession(quarterRows);

  if (!sessions.length) {
    content.appendChild(
      emptyState({
        iconName: 'chart',
        title: '아직 내 기록이 없습니다',
        body: '폰 단독 또는 워치로 경기를 기록하면 여기에 나타납니다. 기록은 저장·열람·공유 모두 무료입니다.',
      }),
    );
    content.appendChild(await teamSharedSection(ctx));
    return screen;
  }

  const totals = sessions.reduce(
    (acc, session) => {
      const sum = fmt.sumQuarters(bySession.get(session.id));
      acc.distance += sum.distance_m;
      acc.quarters += sum.quarters;
      acc.sprints += sum.sprint_count;
      acc.seconds += sum.active_seconds;
      acc.top = Math.max(acc.top, sum.top_speed_kmh);
      return acc;
    },
    { distance: 0, quarters: 0, sprints: 0, seconds: 0, top: 0 },
  );

  content.appendChild(
    h(
      'div',
      { class: 'kpi-grid' },
      statTile({ label: '총 거리', value: fmt.formatMeters(totals.distance), iconName: 'activity' }),
      statTile({ label: '최고 속도', value: fmt.formatNumber(totals.top, 1), unit: 'km/h', iconName: 'clock', tone: 'green' }),
      statTile({ label: '스프린트', value: fmt.formatNumber(totals.sprints), unit: '회', iconName: 'trophy', tone: 'amber' }),
      statTile({ label: '활동 시간', value: fmt.formatDuration(totals.seconds), iconName: 'heart', tone: 'red' }),
    ),
  );

  // 쿼터별 비교: 최근 세션을 기본으로, 다른 세션은 칩으로 전환.
  let selectedSession = sessions[0];
  const sessionChips = h('div', { class: 'chip-row' });
  const chartHolder = h('div', { class: 'stack' });
  const shareHolder = h('div');

  function drawChart() {
    const quarters = bySession.get(selectedSession.id) || [];
    sessionChips.replaceChildren(
      ...sessions.slice(0, 6).map((session) =>
        chip(fmt.formatMonthDay(session.started_at), {
          active: session.id === selectedSession.id,
          onClick: () => {
            selectedSession = session;
            drawChart();
          },
        }),
      ),
    );
    mount(
      chartHolder,
      barChart(
        quarters.map((row) => ({
          label: `${row.quarter}Q`,
          value: row.is_rest ? 0 : Number(row.distance_m) || 0,
          display: row.is_rest ? '휴식' : fmt.formatMeters(row.distance_m),
          rest: row.is_rest,
        })),
        { emptyLabel: '이 경기의 쿼터 기록이 없습니다.' },
      ),
    );
    mount(
      shareHolder,
      h(
        'div',
        { class: 'share-row' },
        h(
          'div',
          { class: 'share-row-main' },
          h('span', { class: 'share-title' }, '팀원에게 공유'),
          h('span', { class: 'share-sub' }, '켜면 같은 경기의 팀원이 집계 지표를 볼 수 있습니다. 기본은 비공개입니다.'),
        ),
        switchToggle({
          checked: Boolean(selectedSession.share_with_team),
          label: '팀 공유',
          onChange: async (next) => {
            try {
              await sessionsApi.setShare(selectedSession.id, next);
              selectedSession.share_with_team = next;
              toast(next ? '팀원에게 공유합니다.' : '공유를 껐습니다.', { kind: 'ok' });
            } catch (error) {
              toast(error.message, { kind: 'error', ms: 4000 });
              drawChart();
            }
          },
        }),
      ),
    );
  }
  drawChart();

  content.appendChild(
    section(
      '쿼터별 비교',
      h('span', { class: 'section-note' }, fmt.formatMonthDay(selectedSession.started_at)),
      h(
        'div',
        { class: 'card' },
        sessionChips,
        chartHolder,
        h('p', { class: 'hint-box' }, '쿼터별 이동 거리입니다. 휴식 쿼터는 빗금으로 표시됩니다.'),
        shareHolder,
      ),
    ),
  );

  content.appendChild(
    section(
      '내 세션',
      h('span', { class: 'section-note' }, `${sessions.length}건`),
      h(
        'div',
        { class: 'list' },
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
              h(
                'div',
                { class: 'session-top' },
                h('span', { class: 'session-title' }, matchTitle(session.match_id)),
                h('span', { class: 'session-date' }, fmt.formatMonthDay(session.started_at)),
              ),
              h('div', { class: 'session-meta' }, sessionSub(session)),
              h(
                'div',
                { class: 'session-stats' },
                h('span', null, fmt.formatMeters(sum.distance_m)),
                h('span', null, `${sum.quarters}쿼터`),
                sum.top_speed_kmh ? h('span', null, `${fmt.formatNumber(sum.top_speed_kmh, 1)} km/h`) : null,
                sum.sprint_count ? h('span', null, `스프린트 ${fmt.formatNumber(sum.sprint_count)}`) : null,
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

  content.appendChild(await teamSharedSection(ctx));

  content.appendChild(
    h(
      'p',
      { class: 'foot-note' },
      '공유를 켠 기록만 팀원에게 보입니다. 원본 GPS 좌표는 본인만 볼 수 있습니다.',
    ),
  );

  return screen;
}

export async function renderRecords(root, ctx) {
  root.classList.remove('auth-screen');
  await renderScreen(root, ctx, () => build(root, ctx));
}
