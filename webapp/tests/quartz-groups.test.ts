import assert from 'node:assert/strict';
import test from 'node:test';
import { ELEMENTS, emptyElements, type Quartz } from '../lib/domain.ts';
import { DEFAULT_GAME_DATA } from '../lib/default-data.ts';
import { getQuartzGroup, groupQuartzForInventory } from '../lib/quartz-groups.ts';

function quartz(id: string, elements: Partial<Quartz['elements']>, series?: Quartz['series']): Quartz {
  return { id, name: id, elements: { ...emptyElements(), ...elements }, series, family: null, quartzLevel: 1, stats: {}, tags: [], uniqueEquip: false };
}

test('groups mixed quartz by its declared series regardless of element order or magnitude', () => {
  assert.equal(getQuartzGroup(quartz('mixed', { earth: 1, fire: 5 }, 'fire')), 'fire');
  assert.equal(getQuartzGroup(quartz('mixed-water', { water: 2, mirage: 8 }, 'water')), 'water');
  assert.equal(getQuartzGroup(quartz('慈爱', { earth: 4, water: 4 }, 'water')), 'water');
  assert.equal(getQuartzGroup(quartz('瀑布', { earth: 3, water: 3, fire: 3, wind: 3 }, 'water')), 'water');
});

test('legacy quartz uses the same series fallback as labels and the solver', () => {
  assert.equal(getQuartzGroup(quartz('mixed-time', { time: 1, space: 4, mirage: 3 })), 'space');
  assert.equal(getQuartzGroup(quartz('fire', { earth: 0, water: 0, fire: 3 })), 'fire');
});

test('quartz without elements retains its declared series or remains visible in the none group', () => {
  assert.equal(getQuartzGroup(quartz('empty', {})), 'none');
  assert.equal(getQuartzGroup(quartz('empty-water', {}, 'water')), 'water');
});

test('all seven groups are ordered consistently and every quartz appears exactly once', () => {
  const items = [...ELEMENTS].reverse().map((element) => quartz(element, { [element]: 1 }));
  items.push(quartz('empty', {}), quartz('earth-second', { earth: 1, wind: 6 }, 'earth'));
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

test('all screenshot quartz belong to their recorded game series, including 慈爱 and 瀑布', () => {
  const groups = groupQuartzForInventory(DEFAULT_GAME_DATA.quartz);
  for (const group of groups) {
    for (const item of group.quartz) assert.equal(group.id, item.series, item.name);
  }
  const water = groups.find((group) => group.id === 'water')!;
  assert.ok(water.quartz.some((item) => item.name === '慈爱'));
  assert.ok(water.quartz.some((item) => item.name === '瀑布'));
});
