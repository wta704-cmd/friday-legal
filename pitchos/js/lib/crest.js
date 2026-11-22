// Deterministic team emblem, identical on every device without a server call.
// Mirrors shared-spec/design-tokens.json -> teamCrest.

export const CREST_PALETTE = [
  '#2563EB',
  '#1D4ED8',
  '#0EA5E9',
  '#0284C7',
  '#4F46E5',
  '#38BDF8',
  '#1E40AF',
  '#0891B2',
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
