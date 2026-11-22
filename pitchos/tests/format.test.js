import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deadlineState,
  formatClock,
  formatDateTime,
  formatDuration,
  formatKickoff,
  formatMeters,
  formatMonthDay,
  fromLocalInput,
  lateText,
  sumQuarters,
  toLocalInput,
} from '../js/lib/format.js';

test('formatKickoff renders Asia/Seoul regardless of the host timezone', () => {
  // 11:00Z is 20:00 in Seoul, 2026-11-29 is a Sunday.
  assert.equal(formatKickoff('2026-11-29T11:00:00Z'), '11월 29일 (일) 20:00');
  // 15:30Z is 00:30 the next day in Seoul.
  assert.equal(formatKickoff('2026-11-29T15:30:00Z'), '11월 30일 (월) 00:30');
});

test('formatDateTime / formatMonthDay / formatClock', () => {
  assert.equal(formatDateTime('2026-11-27T13:00:00Z'), '2026.11.27 22:00');
  assert.equal(formatMonthDay('2026-11-29T11:00:00Z'), '11.29 (일)');
  assert.equal(formatClock('2026-11-29T11:00:00Z'), '20:00');
});

test('deadlineState counts down and closes at the deadline', () => {
  const deadline = '2026-11-27T13:00:00Z';
  const before = new Date('2026-11-25T10:00:00Z').getTime();
  const state = deadlineState(deadline, before);
  assert.equal(state.closed, false);
  assert.match(state.text, /마감까지 2일/);

  const soon = deadlineState(deadline, new Date('2026-11-27T09:00:00Z').getTime());
  assert.equal(soon.tone, 'soon');
  assert.match(soon.text, /4시간/);

  const closed = deadlineState(deadline, new Date('2026-11-27T13:00:00Z').getTime());
  assert.equal(closed.closed, true);
  assert.equal(closed.text, '투표 마감');

  assert.deepEqual(deadlineState(null, Date.now()), { closed: false, text: '마감 없음', tone: 'open' });
});

test('duration and distance formatting', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(95), '1:35');
  assert.equal(formatDuration(3725), '1:02:05');
  assert.equal(formatMeters(842.4), '842 m');
  assert.equal(formatMeters(8420), '8.42 km');
});

test('datetime-local value round-trips through Asia/Seoul', () => {
  const iso = fromLocalInput('2026-11-29T20:00');
  assert.equal(iso, '2026-11-29T11:00:00.000Z');
  assert.equal(toLocalInput(iso), '2026-11-29T20:00');
  assert.equal(fromLocalInput(''), null);
});

test('lateText marks the arrival minutes', () => {
  assert.equal(lateText('late', 10), '지각 10분');
  assert.equal(lateText('late', null), '지각');
  assert.equal(lateText('going', null), '참석');
});

test('sumQuarters adds distance and keeps the top speed', () => {
  const sum = sumQuarters([
    { distance_m: '1200.50', active_seconds: '600', top_speed_kmh: '18.20', sprint_count: 3 },
    { distance_m: 800, active_seconds: 300, top_speed_kmh: 22.4, sprint_count: 2 },
  ]);
  assert.equal(sum.distance_m, 2000.5);
  assert.equal(sum.active_seconds, 900);
  assert.equal(sum.top_speed_kmh, 22.4);
  assert.equal(sum.sprint_count, 5);
  assert.equal(sum.quarters, 2);
});
