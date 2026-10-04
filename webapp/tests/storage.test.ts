import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultPlayerState, DEFAULT_GAME_DATA } from '../lib/default-data.ts';
import type { PlayerState } from '../lib/domain.ts';
import { loadPlayerState, normalizePlayerState, savePlayerState } from '../lib/storage.ts';

test('legacy player states gain empty equipment without resetting custom stock, levels or preferences', () => {
  const player = createDefaultPlayerState();
  const quartzId = DEFAULT_GAME_DATA.quartz[0].id;
  const character = DEFAULT_GAME_DATA.characters[0];
  player.resources[quartzId].ownedCount = 17;
  player.slotLevels[character.id]['0'] = 3;
  player.lastSolver.resourceMode = 'owned_plus_shop';
  const legacy: Partial<PlayerState> = { ...player, version: 'player-0.2' };
  delete legacy.equipment;
  const before = JSON.stringify(legacy);
  const upgraded = normalizePlayerState(DEFAULT_GAME_DATA, legacy);
  assert.equal(upgraded.version, 'player-0.3');
  assert.equal(upgraded.resources[quartzId].ownedCount, 17);
  assert.equal(upgraded.slotLevels[character.id]['0'], 3);
  assert.equal(upgraded.lastSolver.resourceMode, 'owned_plus_shop');
  assert.ok(Object.values(upgraded.equipment).every((slots) => Object.values(slots).every((id) => id === null)));
  assert.equal(JSON.stringify(legacy), before);
});

test('JSON backups preserve equipment and available-only preferences when imported', () => {
  const player = createDefaultPlayerState();
  const quartzId = DEFAULT_GAME_DATA.quartz[0].id;
  player.resources[quartzId].ownedCount = 2;
  player.equipment[DEFAULT_GAME_DATA.characters[0].id][0] = quartzId;
  player.lastSolver.resourceMode = 'available_only';
  const backup = JSON.parse(JSON.stringify({ gameData: DEFAULT_GAME_DATA, playerState: player }));
  assert.deepEqual(normalizePlayerState(backup.gameData, backup.playerState), player);
});

test('saving and reloading player state retains equipment and availability preferences', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } } });
  try {
    const player = createDefaultPlayerState();
    const quartzId = DEFAULT_GAME_DATA.quartz[0].id;
    player.resources[quartzId].ownedCount = 2;
    player.equipment[DEFAULT_GAME_DATA.characters[0].id][0] = quartzId;
    player.lastSolver.resourceMode = 'available_only';
    savePlayerState(player);
    assert.deepEqual(loadPlayerState(DEFAULT_GAME_DATA), player);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('legacy solve settings gain the default budget while keeping user game state', () => {
  const player = createDefaultPlayerState(); delete player.lastSolver.timeoutSeconds; player.lastSolver.rankingPreset = 'resource';
  const before = JSON.stringify(player); const normalized = normalizePlayerState(DEFAULT_GAME_DATA, player);
  assert.equal(normalized.lastSolver.timeoutSeconds, 10); assert.equal(normalized.lastSolver.rankingPreset, 'extra_arts');
  assert.deepEqual(normalized.resources, player.resources); assert.deepEqual(normalized.equipment, player.equipment);
  assert.equal(JSON.stringify(player), before);
});
test('time budgets persist across export/import and invalid budgets return to ten seconds', () => {
  const player = createDefaultPlayerState(); player.lastSolver.timeoutSeconds = 30;
  assert.equal(normalizePlayerState(DEFAULT_GAME_DATA, JSON.parse(JSON.stringify(player))).lastSolver.timeoutSeconds, 30);
  player.lastSolver.timeoutSeconds = -1; assert.equal(normalizePlayerState(DEFAULT_GAME_DATA, player).lastSolver.timeoutSeconds, 10);
});
