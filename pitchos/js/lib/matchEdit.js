// 경기 수정 — 편집 시트의 입력값을 `matches` UPDATE 패치로 바꾸는 순수 함수.
//
// 화면 코드와 분리해 두는 이유: 어떤 값이 실제로 DB에 나가는지(그리고 어떤 값이
// 거부되는지)를 `web/tests/matchEdit.test.js`에서 그대로 확인하기 위해서다.
//
// 서버 쪽 규칙과 맞춰야 하는 부분
//   * `matches`에는 팀 운영진(owner/manager) UPDATE RLS가 이미 있다(0001_init.sql
//     matches_update). 그래서 새 RPC 없이 PATCH 한 번으로 저장하고, 권한 판단은
//     RLS가 한다. 이 모듈은 team_id·created_by·status 같은 열은 절대 보내지 않는다.
//   * 투표 마감 기본값은 create_match와 같은 규칙 — 경기 48시간 전 22시(한국시간).
//     경기 일시를 옮기면 마감도 따라 움직여야 지난 마감이 남지 않는다.

import { QUARTER_COUNT, QUARTER_MINUTES } from './quarters.js';

const KST_OFFSET_MS = 9 * 3_600_000;
const MINUTE = 60_000;
const DAY = 86_400_000;

export const MATCH_KINDS = ['match', 'practice'];
export const MATCH_MODES = ['futsal', 'soccer'];

/** create_match가 만드는 제목과 같은 규칙. */
export function autoTitle(kind, opponent) {
  const name = String(opponent ?? '').trim();
  const title = kind === 'practice' ? '팀 연습' : name ? `vs ${name}` : '경기';
  return title.slice(0, 60);
}

/** KST 기준 그날 00:00의 순간(epoch ms). */
function kstMidnight(epoch) {
  const shifted = new Date(epoch + KST_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - KST_OFFSET_MS;
}

/**
 * create_match의 마감 계산을 그대로 옮긴 것.
 * ① 경기 48시간 전 22:00 KST
 * ② 그 시각이 이미 경기 뒤면 → 경기 당일 22:00, 단 경기 1시간 전을 넘지 않게
 * ③ 그래도 이미 지났으면 → 지금부터 2시간, 단 경기 1시간 전을 넘지 않게
 */
export function defaultDeadline(kickoffIso, now = Date.now()) {
  const kickoff = typeof kickoffIso === 'number' ? kickoffIso : Date.parse(kickoffIso);
  if (!Number.isFinite(kickoff)) return null;
  const midnight = kstMidnight(kickoff);
  let deadline = midnight - 2 * DAY + 22 * 3_600_000;
  if (deadline > kickoff) deadline = Math.min(midnight + 22 * 3_600_000, kickoff - 3_600_000);
  if (deadline <= now) deadline = Math.min(kickoff - 3_600_000, now + 2 * 3_600_000);
  return new Date(deadline).toISOString();
}

function epoch(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value) {
  return String(value ?? '').trim();
}

function nullable(value) {
  const trimmed = text(value);
  return trimmed ? trimmed : null;
}

function clamp(value, { min, max }, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * 편집 폼 → `matches` PATCH.
 *
 * @param {object} match   지금 DB에 있는 경기 행
 * @param {object} form    편집 시트의 입력값
 *   { title, kind, mode, kickoff(ISO), opponent, pitchName, indoor,
 *     quarterCount, quarterMinutes, deadline(ISO|null) }
 * @param {{now?:number, followKickoff?:boolean}} options
 *   followKickoff=true면 경기 일시가 바뀔 때 마감을 create_match 규칙으로 다시 계산한다
 *   (사용자가 마감을 직접 고치지 않은 경우 UI가 이 값을 준다).
 * @returns {{patch:object, errors:string[], unchanged:boolean}}
 */
export function buildMatchPatch(match, form, { now = Date.now(), followKickoff = false } = {}) {
  const errors = [];
  const source = match || {};

  const kind = MATCH_KINDS.includes(form.kind) ? form.kind : null;
  if (!kind) errors.push('경기 종류를 다시 선택해 주세요.');

  const mode = MATCH_MODES.includes(form.mode) ? form.mode : null;
  if (!mode) errors.push('경기 유형(풋살·축구)을 다시 선택해 주세요.');

  const title = text(form.title).slice(0, 60);
  if (!title) errors.push('경기 이름을 입력해 주세요.');

  const opponent = nullable(form.opponent);
  if (opponent && opponent.length > 40) errors.push('상대 팀 이름은 40자까지 입력할 수 있습니다.');

  const pitchName = nullable(form.pitchName);
  if (pitchName && pitchName.length > 60) errors.push('구장 이름은 60자까지 입력할 수 있습니다.');

  const kickoff = epoch(form.kickoff);
  const previousKickoff = epoch(source.kickoff_at);
  if (kickoff === null) {
    errors.push('경기 일시를 선택해 주세요.');
  } else if (kickoff !== previousKickoff && kickoff < now - MINUTE) {
    // 지난 경기를 뒤늦게 고치는 것은 막지 않는다. 새로 넣는 시각만 미래여야 한다.
    errors.push('지난 시각으로는 바꿀 수 없습니다.');
  }

  const quarterCount = clamp(form.quarterCount, QUARTER_COUNT, Number(source.quarter_count) || QUARTER_COUNT.default);
  const quarterMinutes = clamp(
    form.quarterMinutes,
    QUARTER_MINUTES,
    Number(source.quarter_minutes) || QUARTER_MINUTES.default,
  );

  // 마감: 비우면 '마감 없음'(null), 값이 있으면 경기 시작 전이어야 한다.
  const previousDeadline = epoch(source.rsvp_deadline_at);
  let deadline = previousDeadline;
  if (followKickoff && kickoff !== null && kickoff !== previousKickoff) {
    deadline = epoch(defaultDeadline(kickoff, now));
  } else if (!text(form.deadline)) {
    deadline = null;
  } else {
    deadline = epoch(form.deadline);
    if (deadline === null) errors.push('투표 마감 시각을 확인해 주세요.');
  }
  if (deadline !== null && kickoff !== null && deadline > kickoff) {
    errors.push('투표 마감은 경기 시작 전이어야 합니다.');
  }

  if (errors.length) return { patch: {}, errors, unchanged: false };

  const patch = {};
  const set = (column, value, current) => {
    if (value !== current) patch[column] = value;
  };

  set('title', title, text(source.title));
  set('kind', kind, source.kind);
  set('mode', mode, source.mode);
  set('opponent_name', opponent, nullable(source.opponent_name));
  set('pitch_name', pitchName, nullable(source.pitch_name));
  if (kickoff !== null) {
    const iso = new Date(kickoff).toISOString();
    const current = epoch(source.kickoff_at);
    if (current === null || current !== kickoff) patch.kickoff_at = iso;
  }
  set('quarter_count', quarterCount, Number(source.quarter_count));
  set('quarter_minutes', quarterMinutes, Number(source.quarter_minutes));
  set('is_indoor', Boolean(form.indoor), Boolean(source.is_indoor));
  set(
    'rsvp_deadline_at',
    deadline === null ? null : new Date(deadline).toISOString(),
    previousDeadline === null ? null : new Date(previousDeadline).toISOString(),
  );

  return { patch, errors, unchanged: Object.keys(patch).length === 0 };
}
