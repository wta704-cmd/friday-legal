// Lineup draft: spread the attending players over the quarters as evenly as
// possible, one goalkeeper per quarter when the roster has one, nobody twice in
// the same quarter. Pure function so the rules are unit tested.

export const PER_SIDE = { futsal: 5, soccer: 11 };

/**
 * @param {object} input
 * @param {number} input.quarterCount
 * @param {Array<{user_id: string, position?: string|null}>} input.players attending players
 * @param {number} [input.perSide] players on the pitch per quarter
 * @returns {Array<{user_id: string, quarter: number, position: string|null, is_starter: boolean}>}
 */
export function draftLineup({ quarterCount, players, perSide = 5 }) {
  const quarters = Math.max(1, Math.min(20, Number(quarterCount) || 4));
  const side = Math.max(1, Number(perSide) || 5);
  const pool = (players || [])
    .filter((player) => player && player.user_id)
    .map((player, index) => ({
      user_id: player.user_id,
      position: normalizePosition(player.position),
      index,
      played: 0,
    }));
  if (pool.length === 0) return [];

  const keepers = pool.filter((player) => player.position === 'GK');
  const outfield = pool.filter((player) => player.position !== 'GK');
  const rows = [];

  const byLoad = (a, b) => a.played - b.played || a.index - b.index;

  for (let quarter = 1; quarter <= quarters; quarter += 1) {
    const chosen = [];
    const used = new Set();

    if (keepers.length > 0 && side > 0) {
      const keeper = [...keepers].sort(byLoad)[0];
      chosen.push(keeper);
      used.add(keeper.user_id);
    }

    const candidates = [...outfield, ...(keepers.length ? [] : [])]
      .filter((player) => !used.has(player.user_id))
      .sort(byLoad);

    for (const player of candidates) {
      if (chosen.length >= side) break;
      chosen.push(player);
      used.add(player.user_id);
    }

    // Fewer outfield players than slots: top up from the keepers that are not
    // already standing in this quarter, then from anyone left in the pool.
    if (chosen.length < side) {
      for (const player of [...pool].sort(byLoad)) {
        if (chosen.length >= side) break;
        if (used.has(player.user_id)) continue;
        chosen.push(player);
        used.add(player.user_id);
      }
    }

    for (const player of chosen) {
      player.played += 1;
      rows.push({
        user_id: player.user_id,
        quarter,
        position: player.position,
        is_starter: quarter === 1,
      });
    }
  }

  return rows;
}

export function normalizePosition(value) {
  const text = String(value || '').trim().toUpperCase();
  return ['GK', 'DF', 'MF', 'FW'].includes(text) ? text : null;
}

/** Group lineup rows by quarter for rendering: Map<quarter, rows[]>. */
export function groupByQuarter(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const quarter = Number(row.quarter);
    if (!map.has(quarter)) map.set(quarter, []);
    map.get(quarter).push(row);
  }
  return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
}
