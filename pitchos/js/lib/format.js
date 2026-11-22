// Pure formatting helpers. No DOM, no network: unit tested in web/tests.

const KST = 'Asia/Seoul';
const WEEKDAY_KO = { Sun: '일', Mon: '월', Tue: '화', Wed: '수', Thu: '목', Fri: '금', Sat: '토' };

/** Break an instant into Asia/Seoul calendar parts. */
export function kstParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const out = {};
  for (const part of fmt.formatToParts(date)) out[part.type] = part.value;
  // Some engines render midnight as 24:00 with hour12:false.
  if (out.hour === '24') out.hour = '00';
  return out;
}

export function weekdayKo(short) {
  return WEEKDAY_KO[short] || '';
}

/** "11월 29일 (토) 20:00" */
export function formatKickoff(value) {
  const p = kstParts(value);
  if (!p) return '-';
  return `${Number(p.month)}월 ${Number(p.day)}일 (${weekdayKo(p.weekday)}) ${p.hour}:${p.minute}`;
}

/** "2026.11.29 20:00" */
export function formatDateTime(value) {
  const p = kstParts(value);
  if (!p) return '-';
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
}

/** "11.29 (토)" */
export function formatMonthDay(value) {
  const p = kstParts(value);
  if (!p) return '-';
  return `${Number(p.month)}.${Number(p.day)} (${weekdayKo(p.weekday)})`;
}

/** "20:00" */
export function formatClock(value) {
  const p = kstParts(value);
  if (!p) return '-';
  return `${p.hour}:${p.minute}`;
}

/**
 * Countdown label for the RSVP deadline.
 * Returns { closed, text, tone } where tone is 'open' | 'soon' | 'closed'.
 */
export function deadlineState(deadline, now = Date.now()) {
  if (!deadline) return { closed: false, text: '마감 없음', tone: 'open' };
  const target = new Date(deadline).getTime();
  if (Number.isNaN(target)) return { closed: false, text: '마감 없음', tone: 'open' };
  const diff = target - now;
  if (diff <= 0) return { closed: true, text: '투표 마감', tone: 'closed' };

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  let text;
  if (days > 0) text = `마감까지 ${days}일 ${hours}시간`;
  else if (hours > 0) text = `마감까지 ${hours}시간 ${mins}분`;
  else text = `마감까지 ${Math.max(1, mins)}분`;
  return { closed: false, text, tone: diff < 6 * 3_600_000 ? 'soon' : 'open' };
}

/** seconds -> "12:34" or "1:02:03" */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** metres -> "842 m" / "8.42 km" */
export function formatMeters(value) {
  const m = Number(value) || 0;
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

export function formatNumber(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** ISO -> value for <input type="datetime-local"> in Asia/Seoul */
export function toLocalInput(value) {
  const p = kstParts(value);
  if (!p) return '';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "2026-11-29T20:00" read as Asia/Seoul -> ISO instant */
export function fromLocalInput(value) {
  if (!value) return null;
  const date = new Date(`${value}:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const RSVP_LABEL = {
  going: '참석',
  late: '지각',
  maybe: '미정',
  declined: '불참',
  no_response: '미응답',
};

export const RSVP_TONE = {
  going: 'ok',
  late: 'warn',
  maybe: 'muted',
  declined: 'bad',
  no_response: 'muted',
};

export const ROLE_LABEL = { owner: '팀장', manager: '매니저', member: '멤버' };
export const MATCH_STATUS_LABEL = {
  scheduled: '예정',
  live: '진행 중',
  completed: '종료',
  canceled: '취소',
};
export const TICKET_CATEGORY_LABEL = {
  watch: '워치 연동',
  gps_heatmap: 'GPS·히트맵',
  team_vote: '팀·투표',
  account: '계정',
  other: '기타',
};
export const TICKET_STATUS_LABEL = {
  open: '접수',
  in_progress: '처리 중',
  answered: '답변 완료',
  closed: '종료',
};
export const MODE_LABEL = { soccer: '축구', futsal: '풋살' };
export const PLAN_LABEL = { free: '무료', team: 'Team' };
export const SYNC_POLICY_LABEL = {
  local_only: '기기에만 보관',
  summary_only: '요약만 동기화',
  full: '원본까지 동기화',
};

export function lateText(status, eta) {
  if (status !== 'late') return RSVP_LABEL[status] || status || '-';
  return eta ? `지각 ${eta}분` : '지각';
}

/** Sum of quarter rows, for the record list headline. */
export function sumQuarters(rows) {
  const out = { distance_m: 0, active_seconds: 0, top_speed_kmh: 0, sprint_count: 0, quarters: 0 };
  for (const row of rows || []) {
    out.distance_m += Number(row.distance_m) || 0;
    out.active_seconds += Number(row.active_seconds) || 0;
    out.top_speed_kmh = Math.max(out.top_speed_kmh, Number(row.top_speed_kmh) || 0);
    out.sprint_count += Number(row.sprint_count) || 0;
    out.quarters += 1;
  }
  return out;
}
