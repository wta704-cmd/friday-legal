// 기록 탭: 핵심 지표, 쿼터별 비교, 공유 토글, 팀원 공유 기록.
//
// 이 웹은 GPS를 직접 기록하지 않는다. 폰·워치 앱이 남긴 세션을 읽고, 애플워치
// 피트니스 기록(GPX)은 여기서 올려 거리·속도·스프린트·쿼터 지표로 바꿔 저장한다.

import { sessions as sessionsApi } from '../api.js';
import { state, loadMatches, loadMembers, currentTeam, memberMap } from '../store.js';
import * as fmt from '../lib/format.js';
import { analyzeGpx, GpxError } from '../lib/gpx.js';
import {
  h,
  badge,
  button,
  crest,
  openSheet,
  toast,
  emptyState,
  section,
  statTile,
  barChart,
  switchToggle,
  stepper,
  select,
  chip,
  mount,
} from '../ui.js';
import { appHeader, teamSwitcher, renderScreen, iconButton, noTeamState } from './common.js';

const SAMPLE_GPX = new URL('../../samples/apple-watch-futsal-sample.gpx', import.meta.url);

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
// 워치 기록(GPX) 업로드
// ---------------------------------------------------------------------------

function matchOptions() {
  const rows = [...state.matches].sort((a, b) => new Date(b.kickoff_at) - new Date(a.kickoff_at));
  return [
    { value: '', label: '개인 연습 (경기 없음)' },
    ...rows.slice(0, 12).map((match) => ({
      value: match.id,
      label: `${match.title} · ${fmt.formatMonthDay(match.kickoff_at)}`,
    })),
  ];
}

function openWatchUpload(ctx) {
  const first = [...state.matches].sort((a, b) => new Date(b.kickoff_at) - new Date(a.kickoff_at))[0] || null;
  let matchId = first?.id || '';
  let gpxText = '';
  let analysis = null;
  let shareWithTeam = false;
  let busy = false;

  const matchField = select({
    label: '어느 경기의 기록인가요?',
    options: matchOptions(),
    value: matchId,
    hint: '경기의 쿼터 수에 맞춰 거리를 나눕니다. 경기 없이 올리면 개인 연습으로 저장됩니다.',
  });
  const quarterField = stepper({
    label: '쿼터 수',
    value: first?.quarter_count || 4,
    min: 1,
    max: 20,
    step: 1,
    suffix: '쿼터',
    hint: '고른 경기의 쿼터 수가 기본값입니다. 녹음이 다르면 − / + 로 맞춰 주세요.',
    onChange: () => {
      if (gpxText) parse();
    },
  });

  matchField.input.addEventListener('change', () => {
    matchId = matchField.value;
    const match = state.matches.find((row) => row.id === matchId);
    if (match?.quarter_count) quarterField.set(match.quarter_count, { silent: true });
    if (gpxText) parse();
  });

  const fileNameEl = h('span', { class: 'file-name' }, '선택한 파일 없음');
  const fileInput = h('input', {
    type: 'file',
    accept: '.gpx,application/gpx+xml,text/xml,application/xml',
    hidden: true,
    onchange: (event) => {
      const file = event.target.files?.[0];
      if (file) void readFile(file);
    },
  });
  const pickButton = button('GPX 파일 선택', {
    kind: 'soft',
    iconName: 'share',
    onClick: () => fileInput.click(),
  });

  const preview = h('div', { class: 'stack' });
  const saveButton = button('이 기록 저장하기', {
    block: true,
    size: 'lg',
    iconName: 'check',
    disabled: true,
    onClick: async (event) => {
      if (!analysis || busy) return;
      const target = event.currentTarget;
      busy = true;
      target.disabled = true;
      target.textContent = '저장 중…';
      try {
        const result = await sessionsApi.uploadWatch({
          matchId: matchId || null,
          analysis,
          shareWithTeam,
        });
        toast(`${result.quarterCount}쿼터 기록을 저장했습니다.`, { kind: 'ok', ms: 3200 });
        sheet.close();
        ctx.render();
      } catch (error) {
        toast(error.message, { kind: 'error', ms: 4400 });
        busy = false;
        target.disabled = false;
        target.textContent = '이 기록 저장하기';
      }
    },
  });

  async function readFile(file) {
    fileNameEl.textContent = file.name;
    if (!/\.gpx$/i.test(file.name)) {
      toast('확장자가 .gpx인 파일을 선택해 주세요.', { kind: 'error', ms: 3600 });
    }
    try {
      gpxText = await file.text();
      parse();
    } catch {
      gpxText = '';
      preview.replaceChildren(h('p', { class: 'hint-box' }, '파일을 읽지 못했습니다. 다른 파일로 다시 시도해 주세요.'));
    }
  }

  function parse() {
    try {
      analysis = analyzeGpx(gpxText, { quarterCount: quarterField.value });
      drawPreview();
      saveButton.disabled = false;
    } catch (error) {
      analysis = null;
      saveButton.disabled = true;
      mount(
        preview,
        h(
          'p',
          { class: 'hint-box' },
          error instanceof GpxError ? error.message : 'GPX를 분석하지 못했습니다. 파일을 확인해 주세요.',
        ),
      );
    }
  }

  function drawPreview() {
    const from = new Date(analysis.startedAt);
    const to = new Date(analysis.endedAt);
    mount(
      preview,
      h(
        'div',
        { class: 'kpi-grid' },
        statTile({ label: '총 거리', value: fmt.formatMeters(analysis.distanceM), iconName: 'activity' }),
        statTile({ label: '최고 속도', value: fmt.formatNumber(analysis.topSpeedKmh, 1), unit: 'km/h', iconName: 'clock', tone: 'green' }),
        statTile({ label: '스프린트', value: fmt.formatNumber(analysis.sprintCount), unit: '회', iconName: 'trophy', tone: 'amber' }),
        statTile({ label: '활동 시간', value: fmt.formatDuration(analysis.activeSeconds), iconName: 'heart', tone: 'red' }),
      ),
      h(
        'div',
        { class: 'card card-flush' },
        h('div', { class: 'info-row' }, h('span', { class: 'info-label' }, '기록 구간'), h('span', { class: 'info-value' }, `${fmt.formatDateTime(from)} ~ ${fmt.formatClock(to)}`)),
        h('div', { class: 'info-row' }, h('span', { class: 'info-label' }, '측정 포인트'), h('span', { class: 'info-value' }, `${fmt.formatNumber(analysis.pointCount)}개`)),
        h('div', { class: 'info-row' }, h('span', { class: 'info-label' }, '쿼터 분할'), h('span', { class: 'info-value' }, `${analysis.quarters.length}쿼터`)),
        analysis.avgHeartRate
          ? h('div', { class: 'info-row' }, h('span', { class: 'info-label' }, '평균·최고 심박'), h('span', { class: 'info-value' }, `${analysis.avgHeartRate} / ${analysis.maxHeartRate}`))
          : null,
      ),
      h('p', { class: 'field-hint' }, '녹음 전체 시간을 쿼터 수로 균등 분할합니다. 저장하면 기록 탭·쿼터 차트·팀 공유 기록에 바로 반영됩니다.'),
      h(
        'div',
        { class: 'share-row' },
        h(
          'div',
          { class: 'share-row-main' },
          h('span', { class: 'share-title' }, '팀원에게 공유'),
          h('span', { class: 'share-sub' }, '켜면 같은 경기의 팀원이 집계 지표를 봅니다. 기본은 비공개입니다.'),
        ),
        switchToggle({ checked: shareWithTeam, label: '팀 공유', onChange: (next) => (shareWithTeam = next) }),
      ),
    );
  }

  const sheet = openSheet({
    title: '워치 기록 올리기',
    subtitle: '애플워치 운동 기록(GPX)을 거리·속도·스프린트·쿼터 지표로 바꿉니다.',
    onClose: () => undefined,
    render: (body) => {
      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          matchField.el,
          quarterField.el,
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'field-label' }, 'GPX 파일'),
            h('div', { class: 'file-row' }, pickButton, fileNameEl, fileInput),
            h('span', { class: 'field-hint' }, '.gpx 파일만 올릴 수 있습니다. 파일은 브라우저에서만 읽고 원본은 서버에 보내지 않습니다.'),
          ),
          preview,
          h(
            'details',
            { class: 'guide' },
            h('summary', null, '아이폰에서 GPX 내보내는 방법'),
            h(
              'ol',
              null,
              h('li', null, '경기 전 애플워치에서 피트니스 앱 → [실외 걷기]·[실외 달리기]·[축구] 등 위치를 기록하는 운동을 시작합니다.'),
              h('li', null, '경기가 끝나면 운동을 종료하고 아이폰 건강 앱에 기록이 동기화됐는지 확인합니다.'),
              h(
                'li',
                null,
                '무료 경로: 건강 앱 → 오른쪽 위 프로필 사진 → [모든 건강 데이터 내보내기] → 파일 앱에 zip 저장 → 파일 앱에서 압축 풀기 → apple_health_export/workout-routes/ 안의 날짜별 .gpx 파일을 고릅니다. (전체 내보내기라 시간이 걸리고 파일이 큽니다)',
              ),
              h(
                'li',
                null,
                '경기 하나만 바로 꺼내려면 App Store의 GPX 내보내기 앱(예: HealthFit, RunGap)에서 그 운동을 [GPX 내보내기]로 저장합니다.',
              ),
              h('li', null, '저장한 .gpx 파일을 위 [GPX 파일 선택]으로 열어 주세요.'),
            ),
          ),
          h(
            'div',
            { class: 'sample-row' },
            h('span', { class: 'field-hint' }, '테스트용 풋살 샘플 기록(4쿼터·심박 포함)'),
            h('a', { class: 'link-btn', href: SAMPLE_GPX.href, download: 'JOKBAL_풋살_샘플.gpx' }, '샘플 GPX 내려받기'),
          ),
          h('p', { class: 'hint-box' }, '정확도를 높이려면 경기 시작과 동시에 워치 운동을 시작하고, 경기가 끝나면 바로 종료해 주세요.'),
          saveButton,
        ),
      );
    },
  });
  return sheet;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

async function build(root, ctx) {
  const team = currentTeam();
  const header = appHeader({
    title: '기록',
    subtitle: team ? `${team.name} · 내 퍼포먼스` : '내 기록',
    right: [
      iconButton('share', '워치 기록 올리기', () => openWatchUpload(ctx)),
      iconButton('refresh', '새로고침', () => ctx.render()),
    ],
  });
  const content = h('div', { class: 'content' });
  const screen = h('div', { class: 'screen' }, header, content);

  if (!state.teams.length) {
    content.appendChild(
      button('+ 워치 기록 올리기', {
        block: true,
        kind: 'soft',
        iconName: 'share',
        onClick: () => openWatchUpload(ctx),
      }),
    );
    content.appendChild(
      noTeamState({
        iconName: 'chart',
        title: '기록을 쌓아 보세요',
        body: '폰·워치 앱에서 경기를 기록하거나, 애플워치 GPX를 올리면 거리·속도·쿼터 지표가 여기에 모입니다.',
        onDone: () => ctx.render(),
      }),
    );
    return screen;
  }

  content.appendChild(teamSwitcher(() => ctx.render()));
  content.appendChild(
    button('+ 워치 기록 올리기', {
      block: true,
      kind: 'soft',
      iconName: 'share',
      onClick: () => openWatchUpload(ctx),
    }),
  );
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
        body: '폰 단독 또는 워치로 경기를 기록하거나, 애플워치 GPX를 올리면 여기에 나타납니다. 기록은 저장·열람·공유 모두 무료입니다.',
        actionLabel: '워치 기록 올리기',
        onAction: () => openWatchUpload(ctx),
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
