// 미니 전술판(피치 보드) 배치 계산.
//
// 좌표는 피치 SVG의 viewBox(100 × 125, 우리 골대가 아래) 기준이다. 화면은 이
// 값을 %로 바꿔 선수 원형 뱃지를 얹는다. 순수 함수라 단위 테스트로 검증한다.

import { normalizePosition } from './lineup.js';

export const PITCH_BOX = { width: 100, height: 125 };

/** 공격(FW)이 위, 수비(DF)·골키퍼(GK)가 아래. */
export const POSITION_LINES = [
  { key: 'FW', y: 28 },
  { key: 'MF', y: 58 },
  { key: 'DF', y: 88 },
  { key: 'GK', y: 110 },
];

/** 기본 대형: 풋살 5명, 축구 11명. */
export const FORMATION = {
  futsal: { DF: 1, MF: 2, FW: 1 },
  soccer: { DF: 4, MF: 3, FW: 3 },
};

function spreadX(count) {
  if (count <= 0) return [];
  if (count === 1) return [50];
  const left = 16;
  const right = 84;
  const step = (right - left) / (count - 1);
  return Array.from({ length: count }, (_, index) => Number((left + step * index).toFixed(2)));
}

function outfieldSlots(mode, outfieldCount) {
  const base = FORMATION[mode] || FORMATION.futsal;
  const baseSum = base.DF + base.MF + base.FW;
  if (outfieldCount <= 0) return { DF: 0, MF: 0, FW: 0 };
  if (outfieldCount >= baseSum) {
    // 대형보다 인원이 많으면 남는 자리를 미드필더 → 수비 → 공격 순으로 더한다.
    const extra = outfieldCount - baseSum;
    return {
      DF: base.DF + Math.floor((extra + 2) / 3),
      MF: base.MF + Math.floor((extra + 1) / 3),
      FW: base.FW + Math.floor(extra / 3),
    };
  }
  const df = Math.round((base.DF / baseSum) * outfieldCount);
  const fw = Math.round((base.FW / baseSum) * outfieldCount);
  const mf = Math.max(0, outfieldCount - df - fw);
  return { DF: df, MF: mf, FW: fw };
}

/**
 * 한 쿼터의 선수들을 포지션별 라인에 배치한다.
 * @param {Array<{user_id: string, position?: string|null}>} players
 * @param {{mode?: 'futsal'|'soccer'}} options
 * @returns {Array<{user_id: string, position: string, line: string, x: number, y: number}>}
 */
export function layoutQuarter(players, { mode = 'futsal' } = {}) {
  const pool = (players || []).filter((player) => player && player.user_id);
  if (pool.length === 0) return [];

  const queue = { GK: [], DF: [], MF: [], FW: [], unknown: [] };
  for (const player of pool) {
    const position = normalizePosition(player.position);
    queue[position || 'unknown'].push(player);
  }

  const keeper = queue.GK.length ? queue.GK[0] : null;
  const outfieldCount = pool.length - (keeper ? 1 : 0);
  const slots = outfieldSlots(mode, outfieldCount);

  // 골키퍼가 둘 이상이면 한 명만 골대 앞에 세우고, 나머지는 수비 라인으로 내린다.
  const lines = { DF: [], MF: [], FW: [] };
  if (keeper) for (const extra of queue.GK.slice(1)) queue.DF.push(extra);

  // 1) 자기 포지션 라인을 먼저 채운다.
  for (const key of ['DF', 'MF', 'FW']) {
    while (lines[key].length < slots[key] && queue[key].length) {
      lines[key].push(queue[key].shift());
    }
  }
  // 2) 포지션을 정하지 않은 선수는 빈 자리로.
  for (const key of ['DF', 'MF', 'FW']) {
    while (lines[key].length < slots[key] && queue.unknown.length) {
      lines[key].push(queue.unknown.shift());
    }
  }
  // 3) 자기 라인이 이미 찬 선수는 남은 자리 → 가장 적은 라인 순으로.
  const leftovers = [...queue.DF, ...queue.MF, ...queue.FW, ...queue.unknown];
  for (const player of leftovers) {
    const open = ['MF', 'FW', 'DF'].find((key) => lines[key].length < slots[key]);
    if (open) {
      lines[open].push(player);
      continue;
    }
    const smallest = ['DF', 'MF', 'FW'].sort((a, b) => lines[a].length - lines[b].length)[0];
    lines[smallest].push(player);
  }

  const rows = [];
  if (keeper) {
    rows.push({
      user_id: keeper.user_id,
      position: 'GK',
      line: 'GK',
      x: 50,
      y: POSITION_LINES.find((line) => line.key === 'GK').y,
    });
  }
  for (const line of POSITION_LINES) {
    if (line.key === 'GK') continue;
    const list = lines[line.key];
    const xs = spreadX(list.length);
    list.forEach((player, index) => {
      rows.push({
        user_id: player.user_id,
        position: line.key,
        line: line.key,
        x: xs[index],
        y: line.y,
      });
    });
  }
  return rows;
}
