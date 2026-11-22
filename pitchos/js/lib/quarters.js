// 경기 시간 계산 — 순수 함수, `web/tests/quarters.test.js`에서 단위 테스트.
//
// 경기는 쿼터 사이사이에 쉬는 시간이 있고, **마지막 쿼터 뒤에는 쉬지 않는다**.
// 그래서 총 T분, 쿼터 Q분, 쉬는 시간 B분일 때 T분 안에 들어가는 쿼터 수는
//   floor((T + B) / (Q + B))
// 예: 120분 · 12분 · 1분 → floor(121 / 13) = 9쿼터, 실제 진행 9×12 + 8×1 = 116분.

export const QUARTER_MINUTES = { min: 5, max: 45, default: 12 };
export const BREAK_MINUTES = { min: 0, max: 15, default: 1 };
export const TOTAL_MINUTES = { min: 10, max: 300, default: 120 };
// matches.quarter_count / quarter_minutes 는 0001_init.sql의 smallint check(1~20, 1~60)를
// 그대로 쓴다. UI에서 저장 가능한 쿼터 수 상한을 DB와 맞춘다.
export const QUARTER_COUNT = { min: 1, max: 20, default: 4 };

/** 정수로 맞추고 범위를 넘으면 경계값으로, 숫자가 아니면 fallback으로. */
export function clampInt(value, { min, max, fallback = min }) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * 한 경기의 실제 진행 시간.
 * @param {{quarters:number, quarterMinutes:number, breakMinutes?:number}} spec
 */
export function matchTiming({ quarters, quarterMinutes, breakMinutes = BREAK_MINUTES.default }) {
  const count = clampInt(quarters, QUARTER_COUNT);
  const perQuarter = clampInt(quarterMinutes, QUARTER_MINUTES);
  const rest = clampInt(breakMinutes, BREAK_MINUTES);
  const playedMinutes = count * perQuarter;
  const breakCount = Math.max(0, count - 1);
  return {
    quarters: count,
    quarterMinutes: perQuarter,
    breakMinutes: rest,
    breakCount,
    playedMinutes,
    breakTotalMinutes: breakCount * rest,
    elapsedMinutes: playedMinutes + breakCount * rest,
  };
}

/**
 * 총 경기 시간에 맞춰 쿼터 수를 계산한다.
 *
 * `quarters`를 주면 그 값을 그대로 쓴다(사용자가 직접 미세 조정한 경우).
 * @param {{totalMinutes:number, quarterMinutes:number, breakMinutes?:number,
 *          quarters?:number|null, maxQuarters?:number}} spec
 */
export function planQuarters({
  totalMinutes,
  quarterMinutes,
  breakMinutes = BREAK_MINUTES.default,
  quarters = null,
  maxQuarters = QUARTER_COUNT.max,
}) {
  const total = clampInt(totalMinutes, TOTAL_MINUTES);
  const perQuarter = clampInt(quarterMinutes, QUARTER_MINUTES);
  const rest = clampInt(breakMinutes, BREAK_MINUTES);
  const limit = clampInt(maxQuarters, QUARTER_COUNT);
  const manual = quarters !== null && quarters !== undefined && quarters !== '';

  const step = perQuarter + rest;
  const fit = step > 0 ? Math.floor((total + rest) / step) : 0;
  const autoQuarters = Math.max(1, fit);
  const clamped = autoQuarters > limit;

  const count = clampInt(manual ? quarters : autoQuarters, { min: QUARTER_COUNT.min, max: limit });
  const timing = matchTiming({ quarters: count, quarterMinutes: perQuarter, breakMinutes: rest });

  return {
    ...timing,
    totalMinutes: total,
    manual,
    autoQuarters,
    clamped,
    maxQuarters: limit,
    /** 총 시간에서 남는(모자라는) 분. 음수면 쿼터가 총 시간보다 길다. */
    spareMinutes: total - timing.elapsedMinutes,
  };
}

/**
 * 계산 근거를 한 줄로: "총 116분 진행 · 휴식 1분×8회 · 여유 4분"
 */
export function describePlan(plan) {
  const parts = [`총 ${plan.elapsedMinutes}분 진행`];
  parts.push(
    plan.breakCount > 0 && plan.breakMinutes > 0
      ? `휴식 ${plan.breakMinutes}분×${plan.breakCount}회`
      : '휴식 없음',
  );
  if (plan.clamped) parts.push(`${plan.maxQuarters}쿼터까지만 저장`);
  if (plan.spareMinutes > 0) parts.push(`여유 ${plan.spareMinutes}분`);
  else if (plan.spareMinutes < 0) parts.push(`총 시간보다 ${-plan.spareMinutes}분 초과`);
  return parts.join(' · ');
}
