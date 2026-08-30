import assert from 'node:assert/strict';
import test from 'node:test';
import { createCharacterTemplate } from '../lib/character-template.ts';

test('creates a seven-slot character and distributes slots across lines', () => {
  const character = createCharacterTemplate({ id: 'kloe', name: ' 科洛丝 ', lineCount: 3, currentLevel: 1, maxGameLevel: 3 });

  assert.equal(character.id, 'kloe');
  assert.equal(character.name, '科洛丝');
  assert.equal(character.slots.length, 7);
  assert.deepEqual(character.lines.map((line) => line.slots), [[0, 1, 4], [0, 2, 5], [0, 3, 6]]);
  assert.ok(character.lines.every((line) => line.slots[0] === 0));
});

test('normalizes line and level values to supported ranges', () => {
  const character = createCharacterTemplate({ id: 'test', name: '测试', lineCount: 99, currentLevel: 3, maxGameLevel: 2 });

  assert.equal(character.lines.length, 6);
  assert.ok(character.slots.every((slot) => slot.currentLevel === 2));
  assert.ok(character.slots.every((slot) => slot.maxGameLevel === 2));
});
