import test from 'node:test';
import assert from 'node:assert/strict';

import {
  planQuarters,
  describePlan,
  matchTiming,
  clampInt,
  QUARTER_COUNT,
  QUARTER_MINUTES,
  BREAK_MINUTES,
} from '../js/lib/quarters.js';

test('120분 · 12분 · 쉬는 1분 → 9쿼터, 실제 116분', () => {
  const plan = planQuarters({ totalMinutes: 120, quarterMinutes: 12, breakMinutes: 1 });
  assert.equal(plan.quarters, 9);
  assert.equal(plan.breakCount, 8);
  assert.equal(plan.playedMinutes, 108);
  assert.equal(plan.elapsedMinutes, 116);
  assert.equal(plan.spareMinutes, 4);
  assert.equal(plan.manual, false);
  assert.equal(plan.clamped, false);
});

test('계산식은 floor((총시간 + 휴식) / (쿼터 + 휴식))', () => {
  for (const [total, quarter, rest, expected] of [
    [120, 12, 1, 9],
    [60, 10, 1, 5],
    [90, 15, 1, 5],
    [150, 12, 1, 11],
    [180, 15, 1, 11],
    [116, 12, 1, 9],
    [120, 12, 0, 10],
  ]) {
    const plan = planQuarters({ totalMinutes: total, quarterMinutes: quarter, breakMinutes: rest });
    assert.equal(plan.quarters, expected, `${total}/${quarter}/${rest}`);
    assert.ok(plan.elapsedMinutes <= total);
  }
});

test('쉬는 시간이 없으면 총 시간을 쿼터로 나눈 만큼 들어간다', () => {
  const plan = planQuarters({ totalMinutes: 120, quarterMinutes: 12, breakMinutes: 0 });
  assert.equal(plan.quarters, 10);
  assert.equal(plan.breakCount, 9);
  assert.equal(plan.breakTotalMinutes, 0);
  assert.equal(plan.elapsedMinutes, 120);
  assert.equal(plan.spareMinutes, 0);
});

test('마지막 쿼터 뒤에는 쉬지 않는다', () => {
  const plan = planQuarters({ totalMinutes: 116, quarterMinutes: 12, breakMinutes: 1 });
  assert.equal(plan.quarters, 9);
  assert.equal(plan.breakCount, 8); // 9쿼터면 휴식은 8회
  assert.equal(plan.elapsedMinutes, 116);
  assert.equal(plan.spareMinutes, 0);
});

test('쿼터 수는 DB 상한(20)을 넘지 않고, 넘으면 그 사실을 알린다', () => {
  const plan = planQuarters({ totalMinutes: 300, quarterMinutes: 5, breakMinutes: 1 });
  assert.equal(plan.autoQuarters, 50);
  assert.equal(plan.clamped, true);
  assert.equal(plan.quarters, QUARTER_COUNT.max);
  assert.equal(plan.elapsedMinutes, 20 * 5 + 19 * 1);
  assert.match(describePlan(plan), /20쿼터까지만 저장/);
});

test('직접 조정한 쿼터 수를 그대로 쓴다', () => {
  const plan = planQuarters({ totalMinutes: 120, quarterMinutes: 12, breakMinutes: 1, quarters: 8 });
  assert.equal(plan.quarters, 8);
  assert.equal(plan.manual, true);
  assert.equal(plan.elapsedMinutes, 8 * 12 + 7);
  assert.equal(plan.spareMinutes, 120 - 103);
  assert.equal(plan.autoQuarters, 9);
});

test('직접 조정값도 1~20 범위로 잘린다', () => {
  assert.equal(planQuarters({ totalMinutes: 120, quarterMinutes: 12, quarters: 99 }).quarters, 20);
  assert.equal(planQuarters({ totalMinutes: 120, quarterMinutes: 12, quarters: 0 }).quarters, 1);
});

test('쿼터가 총 시간보다 길면 모자란 분을 음수로 알린다', () => {
  const plan = planQuarters({ totalMinutes: 20, quarterMinutes: 45, breakMinutes: 1 });
  assert.equal(plan.quarters, 1);
  assert.equal(plan.elapsedMinutes, 45);
  assert.equal(plan.spareMinutes, -25);
  assert.match(describePlan(plan), /총 시간보다 25분 초과/);
});

test('입력값은 범위로 정리된다', () => {
  assert.equal(clampInt('12.6', QUARTER_MINUTES), 13);
  assert.equal(clampInt(1, QUARTER_MINUTES), QUARTER_MINUTES.min);
  assert.equal(clampInt(999, QUARTER_MINUTES), QUARTER_MINUTES.max);
  assert.equal(clampInt('abc', { ...QUARTER_MINUTES, fallback: 12 }), 12);
  assert.equal(clampInt(-3, BREAK_MINUTES), 0);
});

test('matchTiming은 저장된 경기 값으로 진행 시간을 되짚는다', () => {
  const timing = matchTiming({ quarters: 9, quarterMinutes: 12, breakMinutes: 1 });
  assert.deepEqual(
    { ...timing },
    {
      quarters: 9,
      quarterMinutes: 12,
      breakMinutes: 1,
      breakCount: 8,
      playedMinutes: 108,
      breakTotalMinutes: 8,
      elapsedMinutes: 116,
    },
  );
});

test('describePlan은 계산 근거를 한 줄로 보여 준다', () => {
  const plan = planQuarters({ totalMinutes: 120, quarterMinutes: 12, breakMinutes: 1 });
  assert.equal(describePlan(plan), '총 116분 진행 · 휴식 1분×8회 · 여유 4분');
  const noBreak = planQuarters({ totalMinutes: 120, quarterMinutes: 12, breakMinutes: 0 });
  assert.match(describePlan(noBreak), /휴식 없음/);
  const single = planQuarters({ totalMinutes: 12, quarterMinutes: 12, breakMinutes: 1 });
  assert.equal(single.quarters, 1);
  assert.match(describePlan(single), /휴식 없음/);
});
