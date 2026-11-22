import test from 'node:test';
import assert from 'node:assert/strict';

import { layoutQuarter, POSITION_LINES } from '../js/lib/pitch.js';

const players = (count, positions = []) =>
  Array.from({ length: count }, (_, index) => ({
    user_id: `u${index + 1}`,
    position: positions[index] || null,
  }));

test('layoutQuarter places a futsal five with the keeper on the goal line', () => {
  const rows = layoutQuarter(players(5, ['GK', 'DF', 'MF', 'MF', 'FW']), { mode: 'futsal' });
  assert.equal(rows.length, 5);
  const keeper = rows.find((row) => row.line === 'GK');
  assert.ok(keeper);
  assert.equal(keeper.y, POSITION_LINES.find((line) => line.key === 'GK').y);
  assert.equal(keeper.x, 50);
  // Every row sits inside the pitch and each player appears exactly once.
  assert.equal(new Set(rows.map((row) => row.user_id)).size, 5);
  for (const row of rows) {
    assert.ok(row.x > 0 && row.x < 100, `x ${row.x}`);
    assert.ok(row.y > 0 && row.y < 150, `y ${row.y}`);
  }
});

test('layoutQuarter keeps one keeper and drops a second keeper into defence', () => {
  const rows = layoutQuarter(players(6, ['GK', 'GK', 'DF', 'MF', 'MF', 'FW']), { mode: 'futsal' });
  assert.equal(rows.filter((row) => row.line === 'GK').length, 1);
  assert.equal(rows.length, 6);
  assert.equal(rows.find((row) => row.user_id === 'u2').line, 'DF');
});

test('layoutQuarter places players without a position and never loses anyone', () => {
  const rows = layoutQuarter(players(7), { mode: 'soccer' });
  assert.equal(rows.length, 7);
  assert.equal(new Set(rows.map((row) => row.user_id)).size, 7);
});

test('layoutQuarter spreads a full football eleven over four lines', () => {
  const rows = layoutQuarter(players(11, ['GK', ...Array(10).fill(null)]), { mode: 'soccer' });
  const byLine = Object.fromEntries(POSITION_LINES.map((line) => [line.key, rows.filter((row) => row.line === line.key).length]));
  assert.equal(byLine.GK, 1);
  assert.equal(byLine.DF + byLine.MF + byLine.FW, 10);
  assert.ok(byLine.DF >= 3 && byLine.MF >= 3 && byLine.FW >= 2);
});

test('layoutQuarter returns nothing for an empty squad', () => {
  assert.deepEqual(layoutQuarter([], { mode: 'futsal' }), []);
});
