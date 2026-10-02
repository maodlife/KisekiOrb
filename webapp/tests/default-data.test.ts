import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultPlayerState, DEFAULT_GAME_DATA } from '../lib/default-data.ts';
import { ELEMENTS, emptyElements, type ElementValues } from '../lib/domain.ts';

const equipmentByCharacter: Record<string, string[]> = {
  kloe: ['HP 1', '省EP 2', '魔防1', '精神2', '必杀2', 'EP 2', '驱动2'],
  estelle: ['行动力2', '破坏2', '防御2', '攻击2', '命中2', '炎伤之刃', '妨碍2'],
  schera: ['驱动3', 'EP 2', '熏风', '魔防2', '苍玉之盾', '精神1', '慧眼'],
  olivier: ['省EP 2', '魔防1', '回避2', 'EP 2', '驱动2', 'HP 2', '精神2'],
};

const expectedLineTotals: Record<string, ElementValues[]> = {
  kloe: [{ earth: 0, water: 3, fire: 2, wind: 1, time: 4, space: 4, mirage: 4 }],
  estelle: [
    { earth: 2, water: 0, fire: 2, wind: 0, time: 2, space: 2, mirage: 0 },
    { earth: 2, water: 0, fire: 3, wind: 0, time: 0, space: 0, mirage: 2 },
  ],
  schera: [
    { earth: 0, water: 2, fire: 0, wind: 4, time: 0, space: 2, mirage: 0 },
    { earth: 0, water: 7, fire: 0, wind: 5, time: 4, space: 2, mirage: 6 },
  ],
  olivier: [{ earth: 0, water: 4, fire: 0, wind: 3, time: 4, space: 4, mirage: 4 }],
};

const normalizeName = (name: string) => name.replaceAll(' ', '');

test('loads the complete screenshot database', () => {
  assert.equal(DEFAULT_GAME_DATA.version, 'screenshots-2026-10-02');
  assert.equal(DEFAULT_GAME_DATA.characters.length, 4);
  assert.ok(DEFAULT_GAME_DATA.characters.every((character) => character.slots.length === 7));
  assert.equal(DEFAULT_GAME_DATA.quartz.length, 100);
  assert.equal(DEFAULT_GAME_DATA.arts.length, 70);

  assert.equal(new Set(DEFAULT_GAME_DATA.quartz.map((item) => item.id)).size, 100);
  assert.equal(new Set(DEFAULT_GAME_DATA.arts.map((item) => item.id)).size, 70);
  assert.ok(DEFAULT_GAME_DATA.quartz.every((item) => ELEMENTS.every((element) => Number.isInteger(item.elements[element]))));
  assert.ok(DEFAULT_GAME_DATA.arts.every((item) => ELEMENTS.every((element) => Number.isInteger(item.requirements[element]))));
});

test('default resources match every screenshot quartz id', () => {
  const player = createDefaultPlayerState(DEFAULT_GAME_DATA);
  assert.deepEqual(Object.keys(player.resources).sort(), DEFAULT_GAME_DATA.quartz.map((item) => item.id).sort());
  assert.ok(Object.values(player.resources).every((item) => !item.shopAvailable && item.shopPrice === null));
});

test('character lines reproduce the element totals shown in screenshots', () => {
  const quartzByName = new Map(DEFAULT_GAME_DATA.quartz.map((item) => [normalizeName(item.name), item]));

  for (const character of DEFAULT_GAME_DATA.characters) {
    const equipped = equipmentByCharacter[character.id];
    assert.ok(equipped, `missing screenshot equipment for ${character.id}`);

    const actual = character.lines.map((line) => {
      const total = emptyElements();
      for (const slotId of line.slots) {
        const quartz = quartzByName.get(normalizeName(equipped[slotId]));
        if (!quartz) throw new Error(`missing quartz ${equipped[slotId]}`);
        for (const element of ELEMENTS) total[element] += quartz.elements[element];
      }
      return total;
    });

    assert.deepEqual(actual, expectedLineTotals[character.id], character.name);
  }
});
