// 애플워치 피트니스 기록(GPX) 분석 — 순수 함수, `web/tests/gpx.test.js`에서 단위 테스트.
//
// 아이폰 건강 앱/피트니스 내보내기 앱이 만드는 GPX는 단순하다.
//   <trkpt lat="37.5" lon="127.0"><ele>12</ele><time>2026-11-22T12:00:00Z</time></trkpt>
// 그래서 DOMParser 없이도 같은 결과를 내는 작은 파서를 쓴다(브라우저·node 모두 동작).
//
// 계산 규칙
//  - 거리: 연속 두 점의 Haversine 거리 합.
//  - 속도: 구간 속도(거리/시간). 1초 단위 GPS 튐을 줄이려고 연속 3구간을 합산한
//    이동 창 속도를 쓴다.
//  - 스프린트: 창 속도가 5.5 m/s(19.8 km/h) 이상인 구간이 1초 이상 이어질 때 1회.
//  - 멈춤: 두 점 사이가 30초를 넘으면 쉬는 시간으로 보고 거리·속도 계산에서 뺀다.
//  - GPS 튐: 15 m/s(54 km/h)를 넘는 구간은 좌표 오류로 보고 버린다.
//  - 쿼터: 녹음 전체 시간을 쿼터 수로 균등 분할한다(쉬는 시간도 녹음에 포함되므로
//    각 쿼터는 실제 플레이+휴식 구간을 함께 담는다).

export const SPRINT_SPEED_MS = 5.5;
export const MAX_PLAUSIBLE_SPEED_MS = 15;
export const PAUSE_GAP_SECONDS = 30;
export const MIN_SPRINT_SECONDS = 1;
/** 최고 속도 노이즈를 줄이는 이동 창 길이(초). 1Hz GPX면 약 3초 창이다. */
export const SMOOTH_SECONDS = 3;
const MAX_SMOOTH_SEGMENTS = 5;
export const MAX_QUARTERS = 20;

export class GpxError extends Error {
  constructor(message, code = 'invalid_gpx') {
    super(message);
    this.name = 'GpxError';
    this.code = code;
  }
}

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (degrees) => (Number(degrees) * Math.PI) / 180;

/** 두 좌표 사이 거리(m). */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

function attr(attrs, name) {
  const double = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs);
  if (double) return double[1];
  const single = new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(attrs);
  return single ? single[1] : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * GPX 문자열 → { name, points: [{lat, lon, ele, time, hr}], startedAt, endedAt }
 * time은 epoch 밀리초. 시간이 없으면 속도를 계산할 수 없어 오류로 알린다.
 */
export function parseGpx(xml) {
  const text = String(xml || '');
  if (!/<gpx\b/i.test(text)) {
    throw new GpxError('GPX 파일이 아닙니다. 애플워치에서 내보낸 .gpx 파일을 선택해 주세요.');
  }

  const nameMatch = /<trk>([\s\S]*?)<\/trk>/i.exec(text)?.[1]?.match(/<name>([\s\S]*?)<\/name>/i)?.[1];
  const points = [];
  // <trkpt ...> ... </trkpt> 와 자기닫힘 <trkpt ... /> 둘 다 받는다.
  for (const chunk of text.split(/<trkpt\b/i).slice(1)) {
    const attrEnd = chunk.indexOf('>');
    if (attrEnd === -1) continue;
    const attrs = chunk.slice(0, attrEnd);
    const closeAt = chunk.indexOf('</trkpt>');
    const body = closeAt === -1 ? '' : chunk.slice(attrEnd + 1, closeAt);
    const lat = numberOrNull(attr(attrs, 'lat'));
    const lon = numberOrNull(attr(attrs, 'lon'));
    if (lat === null || lon === null) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const timeText = /<time>\s*([^<]+?)\s*<\/time>/i.exec(body)?.[1] || null;
    const time = timeText ? Date.parse(timeText) : null;
    const ele = numberOrNull(/<ele>\s*([^<]+?)\s*<\/ele>/i.exec(body)?.[1]);
    const hrMatch = /<(?:[\w.-]+:)?hr>\s*(\d{2,3})\s*<\//i.exec(body);
    points.push({
      lat,
      lon,
      ele,
      time: Number.isFinite(time) ? time : null,
      hr: hrMatch ? Number(hrMatch[1]) : null,
    });
  }

  if (points.length < 2) {
    throw new GpxError(
      'GPX에서 위치 기록(trkpt)을 두 개 이상 찾지 못했습니다. 운동 기록이 담긴 파일인지 확인해 주세요.',
      'no_points',
    );
  }
  if (points.every((point) => point.time === null)) {
    throw new GpxError('GPX에 시간 정보가 없어 속도를 계산할 수 없습니다.', 'no_time');
  }

  // 시간 순서가 뒤섞인 파일(일부 앱)을 정리한다.
  const ordered = points.every((point, index) => index === 0 || (point.time ?? 0) >= (points[index - 1].time ?? 0))
    ? points
    : [...points].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

  const timed = ordered.filter((point) => point.time !== null);
  return {
    name: nameMatch ? nameMatch.trim() : null,
    points: ordered,
    startedAt: timed.length ? timed[0].time : null,
    endedAt: timed.length ? timed[timed.length - 1].time : null,
  };
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

/**
 * 정리된 좌표 목록 → 구간·이동 창 속도.
 * @param {Array<{lat:number, lon:number, time:number|null}>} points
 */
export function buildSegments(points) {
  const segments = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from.time === null || to.time === null) continue;
    const dtSeconds = (to.time - from.time) / 1000;
    if (!(dtSeconds > 0) || dtSeconds > PAUSE_GAP_SECONDS) continue; // 멈춤·중복 시각
    const distanceM = haversineMeters(from.lat, from.lon, to.lat, to.lon);
    const speedMs = distanceM / dtSeconds;
    if (speedMs > MAX_PLAUSIBLE_SPEED_MS) continue; // GPS 튐
    segments.push({
      fromLat: from.lat,
      fromLon: from.lon,
      toLat: to.lat,
      toLon: to.lon,
      startAt: from.time,
      endAt: to.time,
      dtSeconds,
      distanceM,
      speedMs,
      hr: from.hr ?? to.hr ?? null,
    });
  }
  // 이동 창 속도: 최근 SMOOTH_SECONDS 안의 구간을 합쳐 노이즈를 줄인다.
  // 샘플 간격이 넓은 파일(3초 간격 등)에서는 구간 하나가 곧 창이 된다.
  for (let index = 0; index < segments.length; index += 1) {
    let distance = 0;
    let seconds = 0;
    for (let cursor = index; cursor >= 0 && index - cursor < MAX_SMOOTH_SEGMENTS; cursor -= 1) {
      distance += segments[cursor].distanceM;
      seconds += segments[cursor].dtSeconds;
      if (seconds >= SMOOTH_SECONDS) break;
    }
    segments[index].windowSpeedMs = seconds > 0 ? distance / seconds : 0;
  }
  return segments;
}

/** 스프린트(5.5 m/s 이상이 1초 이상 이어진 구간) 횟수와 구간 목록. */
export function findSprints(segments) {
  const runs = [];
  let current = null;
  for (const segment of segments) {
    const sprinting = segment.windowSpeedMs >= SPRINT_SPEED_MS;
    if (sprinting) {
      if (!current) current = { startAt: segment.startAt, endAt: segment.endAt, seconds: 0, distanceM: 0, peakSpeedMs: 0 };
      current.endAt = segment.endAt;
      current.seconds += segment.dtSeconds;
      current.distanceM += segment.distanceM;
      current.peakSpeedMs = Math.max(current.peakSpeedMs, segment.windowSpeedMs);
    } else if (current) {
      runs.push(current);
      current = null;
    }
  }
  if (current) runs.push(current);
  return runs.filter((run) => run.seconds >= MIN_SPRINT_SECONDS);
}

/**
 * 좌표 목록 → 요약 + 쿼터별 지표.
 * @param {Array<{lat:number, lon:number, time:number|null, hr:number|null}>} points
 * @param {{quarterCount?:number, quarterMinutes?:number, breakMinutes?:number}} options
 */
export function analyzePoints(points, { quarterCount = null } = {}) {
  const segments = buildSegments(points);
  const sprints = findSprints(segments);

  const distanceM = segments.reduce((sum, segment) => sum + segment.distanceM, 0);
  const recordedSeconds = segments.reduce((sum, segment) => sum + segment.dtSeconds, 0);
  const topSpeedKmh = segments.reduce((top, segment) => Math.max(top, segment.windowSpeedMs), 0) * 3.6;
  const heartRates = points.map((point) => point.hr).filter((hr) => Number.isFinite(hr) && hr > 0);
  const times = points.map((point) => point.time).filter((time) => time !== null);

  const count = Math.max(1, Math.min(MAX_QUARTERS, Math.round(Number(quarterCount)) || 4));
  const startedAt = times.length ? times[0] : null;
  const endedAt = times.length ? times[times.length - 1] : null;
  const spanMs = startedAt !== null && endedAt !== null ? Math.max(1, endedAt - startedAt) : 1;

  const quarters = Array.from({ length: count }, (_, index) => ({
    quarter: index + 1,
    distanceM: 0,
    activeSeconds: 0,
    topSpeedMs: 0,
    sprintCount: 0,
    heartRates: [],
  }));

  const quarterOf = (time) => {
    if (startedAt === null || time === null) return quarters[0];
    const ratio = Math.min(0.999999, Math.max(0, (time - startedAt) / spanMs));
    return quarters[Math.min(count - 1, Math.floor(ratio * count))];
  };

  for (const segment of segments) {
    const quarter = quarterOf(segment.endAt);
    quarter.distanceM += segment.distanceM;
    quarter.activeSeconds += segment.dtSeconds;
    quarter.topSpeedMs = Math.max(quarter.topSpeedMs, segment.windowSpeedMs);
    if (Number.isFinite(segment.hr) && segment.hr > 0) quarter.heartRates.push(segment.hr);
  }
  for (const sprint of sprints) {
    quarterOf(sprint.endAt).sprintCount += 1;
  }

  return {
    pointCount: points.length,
    startedAt,
    endedAt,
    distanceM: round(distanceM),
    activeSeconds: round(recordedSeconds),
    topSpeedKmh: round(topSpeedKmh, 1),
    sprintCount: sprints.length,
    avgHeartRate: heartRates.length
      ? Math.round(heartRates.reduce((sum, hr) => sum + hr, 0) / heartRates.length)
      : null,
    maxHeartRate: heartRates.length ? Math.max(...heartRates) : null,
    quarters: quarters.map((quarter) => ({
      quarter: quarter.quarter,
      distanceM: round(quarter.distanceM),
      activeSeconds: round(quarter.activeSeconds),
      distancePerMin: quarter.activeSeconds > 0 ? round((quarter.distanceM / quarter.activeSeconds) * 60) : 0,
      topSpeedKmh: round(quarter.topSpeedMs * 3.6, 1),
      sprintCount: quarter.sprintCount,
      avgHeartRate: quarter.heartRates.length
        ? Math.round(quarter.heartRates.reduce((sum, hr) => sum + hr, 0) / quarter.heartRates.length)
        : null,
      maxHeartRate: quarter.heartRates.length ? Math.max(...quarter.heartRates) : null,
    })),
  };
}

/** GPX 문자열 한 번에 분석: 파싱 + 요약 + 쿼터 분할. */
export function analyzeGpx(xml, options = {}) {
  const track = parseGpx(xml);
  return { track, ...analyzePoints(track.points, options) };
}
