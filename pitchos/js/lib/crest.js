// Deterministic team emblem, identical on every device without a server call.
// Mirrors shared-spec/design-tokens.json -> teamCrest.

export const AVATAR_TONES = [
  { bg: '#DDF7E7', fg: '#0B7A3C' },
  { bg: '#E7F0FF', fg: '#1D4ED8' },
  { bg: '#FDF2D6', fg: '#7A5200' },
  { bg: '#FEE6E6', fg: '#C62C2C' },
  { bg: '#ECE9FD', fg: '#5B45C9' },
  { bg: '#DFF5F5', fg: '#0E6E6E' },
  { bg: '#FCE8F2', fg: '#A3206B' },
  { bg: '#EFF1F4', fg: '#333D4B' },
];

/** Person avatar colours (soft background, readable ink) by the same stable hash. */
export function avatarTone(name) {
  return AVATAR_TONES[crestHash(name) % AVATAR_TONES.length];
}

// 팀 엠블럼: 흰 글자가 올라가므로 모두 충분히 어두운 값만 쓴다.
// 피치 그린을 중심으로 두고, 팀끼리 구분되는 액센트를 섞는다.
export const CREST_PALETTE = [
  '#16A34A',
  '#0E8A3D',
  '#0B7032',
  '#0F766E',
  '#1D4ED8',
  '#4338CA',
  '#B45309',
  '#BE123C',
];

/** FNV-1a over the lowercased, trimmed name (not String.hashCode, so every client agrees). */
export function crestHash(name) {
  const text = String(name || '').trim().toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function crestColor(name) {
  return CREST_PALETTE[crestHash(name) % CREST_PALETTE.length];
}

/**
 * Korean: first two Hangul syllables ("강남 FC" -> 강남).
 * Latin: first letter of up to two words ("Blue Wolves" -> BW), one word keeps
 * its first two letters ("Arsenal" -> AR). Fallback "P".
 */
export function crestInitials(name) {
  const text = String(name || '').trim();
  if (!text) return 'P';

  const hangul = text.match(/[가-힣]/g);
  if (hangul && hangul.length >= 2) return hangul.slice(0, 2).join('');
  if (hangul && hangul.length === 1) return hangul[0];

  const words = text.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word));
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  const single = words[0] || text;
  const letters = single.replace(/[^A-Za-z0-9]/g, '');
  return letters.slice(0, 2).toUpperCase() || 'P';
}
