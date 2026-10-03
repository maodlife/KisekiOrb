import assert from 'node:assert/strict';
import test from 'node:test';
import { ELEMENTS, emptyElements, type Quartz } from '../lib/domain.ts';
import { getQuartzGroup, groupQuartzForInventory } from '../lib/quartz-groups.ts';

function quartz(id: string, elements: Partial<Quartz['elements']>, series?: Quartz['series']): Quartz {
  return { id, name: id, elements: { ...emptyElements(), ...elements }, series, family: null, quartzLevel: 1, stats: {}, tags: [], uniqueEquip: false };
}

test('groups mixed quartz by the first displayed element, even when series or largest value differs', () => {
  assert.equal(getQuartzGroup(quartz('mixed', { earth: 1, fire: 5 }, 'fire')), 'earth');
  assert.equal(getQuartzGroup(quartz('mixed-water', { water: 2, mirage: 8 }, 'mirage')), 'water');
  assert.equal(getQuartzGroup(quartz('mixed-time', { time: 1, space: 4, mirage: 3 })), 'time');
});

test('zero values are skipped and quartz without elements remains visible in its own group', () => {
  assert.equal(getQuartzGroup(quartz('fire', { earth: 0, water: 0, fire: 3 })), 'fire');
  assert.equal(getQuartzGroup(quartz('empty', {}, 'earth')), 'none');
});

test('all seven groups are ordered consistently and every quartz appears exactly once', () => {
  const items = [...ELEMENTS].reverse().map((element) => quartz(element, { [element]: 1 }));
  items.push(quartz('empty', {}), quartz('earth-second', { earth: 1, wind: 6 }));
  const groups = groupQuartzForInventory(items);
  assert.deepEqual(groups.map((group) => group.id), [...ELEMENTS, 'none']);
  assert.deepEqual(groups[0].quartz.map((item) => item.id), ['earth', 'earth-second']);
  assert.equal(groups.flatMap((group) => group.quartz).length, items.length);
  assert.equal(new Set(groups.flatMap((group) => group.quartz.map((item) => item.id))).size, items.length);
});

test('filtered results omit empty groups without losing matching quartz', () => {
  assert.deepEqual(groupQuartzForInventory([]), []);
  const matching = quartz('water', { water: 3, mirage: 2 });
  assert.deepEqual(groupQuartzForInventory([matching]), [{ id: 'water', quartz: [matching] }]);
});
