import test from 'node:test';
import assert from 'node:assert/strict';

import { CREST_PALETTE, crestColor, crestHash, crestInitials } from '../js/lib/crest.js';

test('Korean names keep the first two syllables', () => {
  assert.equal(crestInitials('강남 FC'), '강남');
  assert.equal(crestInitials('화이트울브스'), '화이');
  assert.equal(crestInitials('FC 서울'), '서울');
});

test('Latin names use the first letter of two words', () => {
  assert.equal(crestInitials('Blue Wolves'), 'BW');
  assert.equal(crestInitials('Arsenal'), 'AR');
  assert.equal(crestInitials('  real madrid  '), 'RM');
});

test('fallbacks never leave the emblem blank', () => {
  assert.equal(crestInitials(''), 'P');
  assert.equal(crestInitials('   '), 'P');
  assert.equal(crestInitials('★'), 'P');
});

test('FNV-1a hash is stable and case-insensitive', () => {
  assert.equal(crestHash('강남 FC'), crestHash('  강남 FC '));
  assert.equal(crestHash('Blue Wolves'), crestHash('blue wolves'));
  assert.notEqual(crestHash('강남 FC'), crestHash('서초 FC'));
});

test('colour comes from the palette', () => {
  for (const name of ['강남 FC', 'Blue Wolves', 'Arsenal', '', '서울 유나이티드']) {
    assert.ok(CREST_PALETTE.includes(crestColor(name)));
  }
});
