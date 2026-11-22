import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  GpxError,
  analyzeGpx,
  analyzePoints,
  buildSegments,
  findSprints,
  haversineMeters,
  parseGpx,
  SPRINT_SPEED_MS,
} from '../js/lib/gpx.js';

const AT = (seconds) => new Date(Date.UTC(2026, 10, 23, 11, 0, 0) + seconds * 1000).toISOString();

function gpxOf(rows) {
  const body = rows
    .map(
      ([lat, lon, seconds, hr]) =>
        `<trkpt lat="${lat}" lon="${lon}"><ele>10</ele><time>${AT(seconds)}</time>` +
        (hr ? `<extensions><gpxtpx:hr>${hr}</gpxtpx:hr></extensions>` : '') +
        '</trkpt>',
    )
    .join('\n');
  return `<?xml version="1.0"?><gpx version="1.1"><trk><name>테스트</name><trkseg>${body}</trkseg></trk></gpx>`;
}

// 위도 0.0009도 ≈ 100m (적도 기준).
test('haversine: 위도 0.0009도 차이는 약 100m', () => {
  const distance = haversineMeters(37.5, 127, 37.5009, 127);
  assert.ok(Math.abs(distance - 100) < 0.5, String(distance));
});

test('parseGpx: trkpt·시간·심박·이름을 읽는다', () => {
  const track = parseGpx(
    gpxOf([
      [37.5, 127.0, 0, 98],
      [37.5001, 127.0, 3, 104],
      [37.5002, 127.0, 6, 111],
    ]),
  );
  assert.equal(track.points.length, 3);
  assert.equal(track.points[1].hr, 104);
  assert.equal(track.name, '테스트');
  assert.equal(track.endedAt - track.startedAt, 6000);
});

test('parseGpx: 자기닫힘 trkpt도 개수를 흘리지 않는다', () => {
  const xml =
    '<?xml version="1.0"?><gpx><trk><trkseg>' +
    '<trkpt lat="37.5" lon="127.0"/>' +
    '<trkpt lat="37.5001" lon="127.0"><time>2026-11-23T11:00:03Z</time></trkpt>' +
    '<trkpt lat="37.5002" lon="127.0"><time>2026-11-23T11:00:06Z</time></trkpt>' +
    '</trkseg></trk></gpx>';
  const track = parseGpx(xml);
  assert.equal(track.points.length, 3);
});

test('parseGpx: GPX가 아니면 이유를 알려 준다', () => {
  assert.throws(() => parseGpx('그냥 텍스트'), (error) => error instanceof GpxError && /GPX 파일이 아닙니다/.test(error.message));
});

test('parseGpx: 위치 점이 2개 미만이면 거부', () => {
  assert.throws(
    () => parseGpx('<gpx><trk><trkseg><trkpt lat="37.5" lon="127"/></trkseg></trk></gpx>'),
    (error) => error.code === 'no_points',
  );
});

test('parseGpx: 시간이 없으면 속도 계산 불가로 알린다', () => {
  const xml = '<gpx><trk><trkseg><trkpt lat="37.5" lon="127"/><trkpt lat="37.5001" lon="127"/></trkseg></trk></gpx>';
  assert.throws(() => parseGpx(xml), (error) => error.code === 'no_time');
});

test('buildSegments: 30초 넘는 멈춤과 15 m/s 넘는 GPS 튐은 뺀다', () => {
  const points = parseGpx(
    gpxOf([
      [37.5, 127.0, 0],
      [37.5009, 127.0, 3], // 100m/3s = 33m/s → 튐으로 제외
      [37.5018, 127.0, 6], // 100m/3s → 제외
      [37.5, 127.0, 300], // 294초 공백 → 멈춤으로 제외
      [37.50009, 127.0, 303], // 10m/3s = 3.3m/s
    ]),
  ).points;
  const segments = buildSegments(points);
  assert.equal(segments.length, 1);
  assert.ok(segments[0].distanceM > 9 && segments[0].distanceM < 11, String(segments[0].distanceM));
});

test('스프린트: 5.5 m/s 이상이 이어지면 1회로 센다', () => {
  // 3초마다 20m(6.7 m/s) 5회 = 15초 스프린트 1회, 앞뒤 느린 구간.
  const rows = [];
  let lat = 37.5;
  let seconds = 0;
  for (let index = 0; index < 4; index += 1) {
    lat += 0.00003; // 3.3m/3s ≈ 1.1 m/s
    seconds += 3;
    rows.push([lat, 127.0, seconds]);
  }
  for (let index = 0; index < 6; index += 1) {
    lat += 0.00018; // 20m/3s ≈ 6.7 m/s
    seconds += 3;
    rows.push([lat, 127.0, seconds]);
  }
  for (let index = 0; index < 4; index += 1) {
    lat += 0.00003;
    seconds += 3;
    rows.push([lat, 127.0, seconds]);
  }
  const analysis = analyzePoints(parseGpx(gpxOf(rows)).points, { quarterCount: 2 });
  assert.equal(analysis.sprintCount, 1);
  assert.ok(analysis.topSpeedKmh >= SPRINT_SPEED_MS * 3.6, String(analysis.topSpeedKmh));
  assert.ok(analysis.distanceM > 100, String(analysis.distanceM));
});

test('findSprints: 1초도 이어지지 않는 한 점 튐은 스프린트가 아니다', () => {
  const segments = [
    { startAt: 0, endAt: 3000, dtSeconds: 3, distanceM: 3, windowSpeedMs: 1 },
    { startAt: 3000, endAt: 6000, dtSeconds: 3, distanceM: 21, windowSpeedMs: 7 },
    { startAt: 6000, endAt: 9000, dtSeconds: 3, distanceM: 3, windowSpeedMs: 1 },
  ];
  // 창 속도 7인 구간의 지속 시간은 3초라 1회로 센다.
  assert.equal(findSprints(segments).length, 1);
  assert.equal(findSprints([{ ...segments[1], dtSeconds: 0.5 }]).length, 0);
});

test('쿼터 분할: 거리 합이 전체 거리와 같고 쿼터 수가 맞는다', () => {
  const rows = [];
  let lat = 37.5;
  let seconds = 0;
  for (let index = 0; index < 40; index += 1) {
    lat += 0.00009; // 약 10m/3s
    seconds += 3;
    rows.push([lat, 127.0, seconds, 120 + (index % 20)]);
  }
  const analysis = analyzePoints(parseGpx(gpxOf(rows)).points, { quarterCount: 4 });
  assert.equal(analysis.quarters.length, 4);
  const sum = analysis.quarters.reduce((total, quarter) => total + quarter.distanceM, 0);
  assert.ok(Math.abs(sum - analysis.distanceM) < 0.5, `${sum} vs ${analysis.distanceM}`);
  for (const quarter of analysis.quarters) {
    assert.ok(quarter.distanceM > 0, `quarter ${quarter.quarter} 비었음`);
    assert.ok(quarter.activeSeconds > 0);
  }
  assert.ok(analysis.quarters[0].avgHeartRate >= 120);
});

test('쿼터 수를 주지 않으면 4쿼터, 20쿼터를 넘지 않는다', () => {
  const points = parseGpx(gpxOf([[37.5, 127.0, 0], [37.5001, 127.0, 3], [37.5002, 127.0, 6]])).points;
  assert.equal(analyzePoints(points).quarters.length, 4);
  assert.equal(analyzePoints(points, { quarterCount: 99 }).quarters.length, 20);
  assert.equal(analyzePoints(points, { quarterCount: 1 }).quarters.length, 1);
});

test('실제 샘플 GPX(4쿼터 풋살)를 끝까지 분석한다', () => {
  const xml = readFileSync(new URL('../samples/apple-watch-futsal-sample.gpx', import.meta.url), 'utf8');
  const analysis = analyzeGpx(xml, { quarterCount: 4 });
  assert.ok(analysis.pointCount > 500, String(analysis.pointCount));
  assert.ok(analysis.distanceM > 2000, String(analysis.distanceM));
  assert.ok(analysis.topSpeedKmh > 20, String(analysis.topSpeedKmh));
  assert.ok(analysis.sprintCount >= 5, String(analysis.sprintCount));
  assert.ok(analysis.activeSeconds > 2000, String(analysis.activeSeconds));
  assert.equal(analysis.quarters.length, 4);
  assert.ok(analysis.avgHeartRate >= 90 && analysis.avgHeartRate <= 200, String(analysis.avgHeartRate));
  const sum = analysis.quarters.reduce((total, quarter) => total + quarter.distanceM, 0);
  assert.ok(Math.abs(sum - analysis.distanceM) < 1, `${sum} vs ${analysis.distanceM}`);
});
