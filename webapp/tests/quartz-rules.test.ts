import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_GAME_DATA } from '../lib/default-data.ts';
import { getCentralSlotId, getQuartzLevelFamily, getQuartzLineType } from '../lib/quartz-rules.ts';
import { createCharacterTemplate } from '../lib/character-template.ts';

test('recognizes blade, shield and reason types from quartz names', () => {
  assert.equal(getQuartzLineType({ name: '冻结之刃' }), 'blade');
  assert.equal(getQuartzLineType({ name: '黃玉之盾' }), 'shield');
  assert.equal(getQuartzLineType({ name: '混沌之理' }), 'reason');
  assert.equal(getQuartzLineType({ name: ' 冻结之刃２ ' }), 'blade');
});

test('ordinary quartz and unrelated names have no line type', () => {
  for (const name of ['攻击1', '防御2', '牙城', '慈爱', '瀑布', '护盾', '力量之剑', '之刃效果说明']) {
    assert.equal(getQuartzLineType({ name }), null, name);
  }
});

test('numbered quartz share a family across levels, spaces and full-width names', () => {
  for (const names of [['驱动1', ' 驱动２ ', '驱动 3', '驱动4'], ['HP 1', 'ＨＰ２'], ['省EP 1', '省ＥＰ４']]) {
    const family = getQuartzLevelFamily({ name: names[0] });
    assert.ok(family);
    for (const name of names) assert.equal(getQuartzLevelFamily({ name }), family, name);
  }
  for (const name of ['耀脉', '慧眼', '苍玉之盾', '123', '']) assert.equal(getQuartzLevelFamily({ name }), null, name);
  assert.notEqual(getQuartzLevelFamily({ name: 'EP 1' }), getQuartzLevelFamily({ name: '省EP 2' }));
});

test('recognizes all fourteen four-level families in existing screenshot data', () => {
  const families = new Map<string, string[]>();
  for (const item of DEFAULT_GAME_DATA.quartz) {
    const family = getQuartzLevelFamily(item);
    if (family) families.set(family, [...(families.get(family) ?? []), item.name]);
  }
  assert.equal(families.size, 14);
  for (const names of families.values()) assert.equal(names.length, 4, names.join(', '));
});

test('recognizes all 26 special quartz in the screenshot database', () => {
  const counts = { blade: 0, shield: 0, reason: 0 };
  for (const quartz of DEFAULT_GAME_DATA.quartz) {
    const type = getQuartzLineType(quartz);
    if (type) counts[type] += 1;
  }
  assert.deepEqual(counts, { blade: 10, shield: 7, reason: 9 });
});

test('uses explicit center IDs and preserves the center of legacy screenshot data and templates', () => {
  for (const character of DEFAULT_GAME_DATA.characters) {
    assert.equal(getCentralSlotId(character), 3, character.name);
    assert.equal(getCentralSlotId({ ...character, centralSlotId: undefined }), 3, character.name);
    assert.equal(getCentralSlotId({ ...character, centralSlotId: null }), null);
    assert.equal(getCentralSlotId({ ...character, centralSlotId: 0 }), 0);
  }
  const created = createCharacterTemplate({ id: 'test', name: 'Test', lineCount: 2, currentLevel: 1, maxGameLevel: 3 });
  assert.equal(getCentralSlotId(created), 0);
  assert.equal(getCentralSlotId({ ...created, centralSlotId: undefined }), 0);
});

test('a shared slot alone does not imply a center', () => {
  const created = createCharacterTemplate({ id: 'test', name: 'Test', lineCount: 2, currentLevel: 1, maxGameLevel: 3 });
  const relocated = { ...created, centralSlotId: undefined, slots: created.slots.map((slot) => ({ ...slot, x: 10, y: 10 })) };
  assert.equal(getCentralSlotId(relocated), null);
});
