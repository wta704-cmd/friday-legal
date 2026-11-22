import test from 'node:test';
import assert from 'node:assert/strict';

import { draftLineup, groupByQuarter, normalizePosition } from '../js/lib/lineup.js';

const player = (id, position = null) => ({ user_id: id, position });

test('every quarter has exactly perSide players when the roster is big enough', () => {
  const players = Array.from({ length: 9 }, (_, index) => player(`p${index}`));
  const rows = draftLineup({ quarterCount: 4, perSide: 5, players });

  const byQuarter = groupByQuarter(rows);
  assert.equal(byQuarter.size, 4);
  for (const [, list] of byQuarter) assert.equal(list.length, 5);
  assert.equal(rows.length, 20);
});

test('nobody appears twice in the same quarter', () => {
  const players = Array.from({ length: 7 }, (_, index) => player(`p${index}`));
  const rows = draftLineup({ quarterCount: 4, perSide: 5, players });
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.quarter}:${row.user_id}`;
    assert.equal(seen.has(key), false, `duplicate ${key}`);
    seen.add(key);
  }
});

test('game time is spread evenly across the roster', () => {
  const players = Array.from({ length: 10 }, (_, index) => player(`p${index}`));
  const rows = draftLineup({ quarterCount: 4, perSide: 5, players });
  const counts = new Map();
  for (const row of rows) counts.set(row.user_id, (counts.get(row.user_id) || 0) + 1);
  const values = [...counts.values()];
  assert.equal(values.length, 10);
  // 20 slots over 10 players: everyone stands exactly twice.
  for (const value of values) assert.equal(value, 2);
});

test('a single goalkeeper covers every quarter', () => {
  const players = [player('gk', 'GK'), ...Array.from({ length: 8 }, (_, i) => player(`p${i}`))];
  const rows = draftLineup({ quarterCount: 4, perSide: 5, players });
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    const inQuarter = rows.filter((row) => row.quarter === quarter);
    assert.ok(inQuarter.some((row) => row.user_id === 'gk'), `no keeper in quarter ${quarter}`);
  }
});

test('starters are the first quarter', () => {
  const rows = draftLineup({ quarterCount: 3, perSide: 5, players: Array.from({ length: 8 }, (_, i) => player(`p${i}`)) });
  for (const row of rows) assert.equal(row.is_starter, row.quarter === 1);
});

test('roster smaller than the pitch fills what it can, never duplicates', () => {
  const rows = draftLineup({ quarterCount: 2, perSide: 5, players: [player('a'), player('b')] });
  assert.equal(rows.length, 4);
  const byQuarter = groupByQuarter(rows);
  for (const [, list] of byQuarter) assert.equal(list.length, 2);
});

test('empty roster drafts nothing', () => {
  assert.deepEqual(draftLineup({ quarterCount: 4, perSide: 5, players: [] }), []);
});

test('positions are normalised to the four the server accepts', () => {
  assert.equal(normalizePosition(' gk '), 'GK');
  assert.equal(normalizePosition('df'), 'DF');
  assert.equal(normalizePosition('coach'), null);
  assert.equal(normalizePosition(null), null);
});
