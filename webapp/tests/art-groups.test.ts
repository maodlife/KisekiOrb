import assert from 'node:assert/strict';
import test from 'node:test';
import { ELEMENTS, emptyElements, type Art } from '../lib/domain.ts';
import { getArtGroup, groupArtsByFirstElement } from '../lib/art-groups.ts';

function art(id: string, requirements: Partial<Art['requirements']>, series?: Art['series']): Art {
  return { id, name: id, requirements: { ...emptyElements(), ...requirements }, series, epCost: 10, category: '测试' };
}

test('mixed magic belongs to the first displayed requirement rather than its series or largest value', () => {
  assert.equal(getArtGroup(art('mixed', { earth: 1, fire: 5 }, 'fire')), 'earth');
  assert.equal(getArtGroup(art('heal', { water: 5, mirage: 3 }, 'mirage')), 'water');
  assert.equal(getArtGroup(art('clock', { time: 2, space: 4 })), 'time');
});

test('zero requirements are skipped and magic with no requirements stays visible', () => {
  assert.equal(getArtGroup(art('fire', { earth: 0, water: 0, fire: 3 })), 'fire');
  assert.equal(getArtGroup(art('empty', {}, 'earth')), 'none');
});

test('all groups have stable element order and preserve every magic exactly once', () => {
  const arts = [...ELEMENTS].reverse().map((element) => art(element, { [element]: 1 }));
  arts.push(art('empty', {}), art('earth-second', { earth: 1, wind: 6 }));
  const groups = groupArtsByFirstElement(arts);
  assert.deepEqual(groups.map((group) => group.id), [...ELEMENTS, 'none']);
  assert.deepEqual(groups[0].arts.map((item) => item.id), ['earth', 'earth-second']);
  assert.equal(groups.flatMap((group) => group.arts).length, arts.length);
  assert.equal(new Set(groups.flatMap((group) => group.arts.map((item) => item.id))).size, arts.length);
});

test('search results can be grouped without showing empty groups', () => {
  assert.deepEqual(groupArtsByFirstElement([]), []);
  const matching = art('heal', { water: 5, mirage: 3 });
  assert.deepEqual(groupArtsByFirstElement([matching]), [{ id: 'water', arts: [matching] }]);
});
