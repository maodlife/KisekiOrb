import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultPlayerState, DEFAULT_GAME_DATA } from '../lib/default-data.ts';
import type { PlayerState } from '../lib/domain.ts';
import { getCharacterSolverPreferences, updateCharacterSolverPreferences } from '../lib/solver-preferences.ts';
import { normalizePlayerState, loadPlayerState, savePlayerState, saveGameData, resetLocalData } from '../lib/storage.ts';

const [a, b] = DEFAULT_GAME_DATA.characters;

test('each character retains independent requirements, resource mode, budget and slot policies', () => {
  const initial = createDefaultPlayerState();
  const inventory = initial.resources;
  let player = updateCharacterSolverPreferences(DEFAULT_GAME_DATA, initial, a.id, {
    resourceMode: 'available_only', mustHaveArts: [], mustHaveQuartz: [DEFAULT_GAME_DATA.quartz[0].id], timeoutSeconds: 30,
    slotPolicies: { [a.slots[0].id]: { currentLevel: 99, allowUpgrade: true, maxLevel: 3 } },
  });
  player = updateCharacterSolverPreferences(DEFAULT_GAME_DATA, player, b.id, { resourceMode: 'owned_plus_shop', timeoutSeconds: 2 });
  const first = getCharacterSolverPreferences(DEFAULT_GAME_DATA, player, a.id);
  const second = getCharacterSolverPreferences(DEFAULT_GAME_DATA, player, b.id);
  assert.equal(first.resourceMode, 'available_only'); assert.equal(first.timeoutSeconds, 30);
  assert.deepEqual(first.mustHaveArts, []); assert.deepEqual(first.mustHaveQuartz, [DEFAULT_GAME_DATA.quartz[0].id]);
  assert.equal(first.slotPolicies[a.slots[0].id].currentLevel, initial.slotLevels[a.id][String(a.slots[0].id)]);
  assert.equal(first.slotPolicies[a.slots[0].id].allowUpgrade, true);
  assert.equal(second.resourceMode, 'owned_plus_shop'); assert.equal(second.timeoutSeconds, 2);
  assert.deepEqual(second.mustHaveQuartz, []);
  assert.equal(player.resources, inventory);
  assert.deepEqual(getCharacterSolverPreferences(DEFAULT_GAME_DATA, normalizePlayerState(DEFAULT_GAME_DATA, JSON.parse(JSON.stringify(player))), a.id), first);
});

test('legacy settings migrate only to their known last selected character and survive switching', () => {
  const legacy = createDefaultPlayerState(); delete legacy.solverByCharacter;
  legacy.lastSolver = { characterId: b.id, resourceMode: 'available_only', mustHaveArts: [], mustHaveQuartz: [], timeoutSeconds: 35, rankingPreset: 'extra_arts' };
  const normalized = normalizePlayerState(DEFAULT_GAME_DATA, legacy);
  assert.deepEqual(Object.keys(normalized.solverByCharacter!), [b.id]);
  assert.equal(getCharacterSolverPreferences(DEFAULT_GAME_DATA, normalized, b.id).timeoutSeconds, 35);
  assert.equal(getCharacterSolverPreferences(DEFAULT_GAME_DATA, normalized, a.id).timeoutSeconds, 10);
  const switched = updateCharacterSolverPreferences(DEFAULT_GAME_DATA, normalized, a.id, { timeoutSeconds: 7 });
  assert.equal(getCharacterSolverPreferences(DEFAULT_GAME_DATA, switched, b.id).timeoutSeconds, 35);
});

test('unknown legacy character does not transplant its selections onto the fallback character', () => {
  const legacy = createDefaultPlayerState(); delete legacy.solverByCharacter;
  legacy.lastSolver.characterId = 'deleted'; legacy.lastSolver.timeoutSeconds = 77; legacy.lastSolver.resourceMode = 'available_only';
  const normalized = normalizePlayerState(DEFAULT_GAME_DATA, legacy);
  assert.deepEqual(normalized.solverByCharacter, {});
  assert.equal(getCharacterSolverPreferences(DEFAULT_GAME_DATA, normalized, a.id).timeoutSeconds, 10);
  assert.equal(getCharacterSolverPreferences(DEFAULT_GAME_DATA, normalized, a.id).resourceMode, 'owned_only');
});

test('preferences sanitize corrupt values and deleted IDs without mutating their input', () => {
  const player = createDefaultPlayerState();
  player.solverByCharacter = { [a.id]: {
    resourceMode: 'nonsense', timeoutSeconds: -1, mustHaveArts: [DEFAULT_GAME_DATA.arts[0].id, 'gone', DEFAULT_GAME_DATA.arts[0].id],
    mustHaveQuartz: [null, 'gone'], slotPolicies: { '999': { currentLevel: 4, maxLevel: 9 }, [a.slots[0].id]: { currentLevel: 99, allowUpgrade: false, maxLevel: 99 } },
  }, gone: {} } as unknown as PlayerState['solverByCharacter'];
  const before = JSON.stringify(player);
  const normalized = normalizePlayerState(DEFAULT_GAME_DATA, player);
  assert.deepEqual(Object.keys(normalized.solverByCharacter!), [a.id]);
  const prefs = getCharacterSolverPreferences(DEFAULT_GAME_DATA, normalized, a.id);
  assert.equal(prefs.resourceMode, 'owned_only'); assert.equal(prefs.timeoutSeconds, 10);
  assert.deepEqual(prefs.mustHaveQuartz, []); assert.deepEqual(prefs.mustHaveArts, [DEFAULT_GAME_DATA.arts[0].id]);
  assert.equal(prefs.slotPolicies[999], undefined);
  assert.equal(prefs.slotPolicies[a.slots[0].id].allowUpgrade, false);
  assert.equal(prefs.slotPolicies[a.slots[0].id].maxLevel, prefs.slotPolicies[a.slots[0].id].currentLevel);
  assert.equal(JSON.stringify(player), before);
});

test('slot policy reconciles new actual levels, zero levels and changed topology ceilings', () => {
  const game = structuredClone(DEFAULT_GAME_DATA);
  game.characters[0].slots[0].maxGameLevel = 2;
  const player = createDefaultPlayerState(game);
  const slot = game.characters[0].slots[0].id;
  player.slotLevels[a.id][String(slot)] = 0;
  let updated = updateCharacterSolverPreferences(game, player, a.id, { slotPolicies: { [slot]: { currentLevel: 9, allowUpgrade: true, maxLevel: 99 } } });
  let policy = getCharacterSolverPreferences(game, updated, a.id).slotPolicies[slot];
  assert.equal(policy.currentLevel, 0); assert.equal(policy.maxLevel, 2);
  updated = { ...updated, slotLevels: { ...updated.slotLevels, [a.id]: { ...updated.slotLevels[a.id], [slot]: 2 } } };
  policy = getCharacterSolverPreferences(game, updated, a.id).slotPolicies[slot];
  assert.equal(policy.currentLevel, 2); assert.equal(policy.maxLevel, 2);
});

test('corrupt selection maps and missing lastSolver arts recover without throwing', () => {
  for (const map of [null, [], 'corrupt', { [a.id]: null }]) {
    const player = createDefaultPlayerState();
    Object.assign(player, { solverByCharacter: map });
    Object.assign(player.lastSolver, { mustHaveArts: null });
    assert.doesNotThrow(() => normalizePlayerState(DEFAULT_GAME_DATA, player));
  }
});

test('storage APIs tolerate server rendering and denied browser storage', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Reflect.deleteProperty(globalThis, 'window');
    assert.equal(savePlayerState(createDefaultPlayerState()), false);
    assert.equal(saveGameData(DEFAULT_GAME_DATA), false); assert.equal(resetLocalData(), false);
    assert.deepEqual(loadPlayerState(DEFAULT_GAME_DATA), createDefaultPlayerState());
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { get localStorage() { throw new Error('denied'); } } });
    assert.equal(savePlayerState(createDefaultPlayerState()), false);
    assert.equal(saveGameData(DEFAULT_GAME_DATA), false); assert.equal(resetLocalData(), false);
    assert.deepEqual(loadPlayerState(DEFAULT_GAME_DATA), createDefaultPlayerState());
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
