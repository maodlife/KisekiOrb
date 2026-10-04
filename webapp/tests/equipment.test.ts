import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultPlayerState } from '../lib/default-data.ts';
import { emptyElements, type Build, type Character, type GameData, type PlayerState, type SolveRequest } from '../lib/domain.ts';
import { equipBuild, getAvailableQuartzCount, getEquippedCounts, normalizeEquipment, removeQuartzFromEquipment, unequipQuartz } from '../lib/equipment.ts';
import { solveOrbment } from '../lib/solver.ts';

function fixture() {
  const character = (id: string): Character => ({ id, name: id, centralSlotId: 9,
    slots: [9, 13, 42].map((id) => ({ id, x: 50, y: 50, currentLevel: 1, maxGameLevel: 3, restriction: null })),
    lines: [{ id: 'L1', name: 'L1', slots: [9, 13, 42] }],
  });
  const game: GameData = { version: 'test', characters: [character('alice'), character('bob')],
    quartz: ['water', 'wind', 'advanced'].map((id) => ({ id, name: id, family: null, quartzLevel: id === 'advanced' ? 2 : 1,
      elements: { ...emptyElements(), water: 3 }, stats: {}, tags: [], uniqueEquip: false })),
    arts: [{ id: 'tear', name: 'tear', epCost: 0, category: 'test', requirements: { ...emptyElements(), water: 3 } }],
  };
  const player = createDefaultPlayerState(game);
  for (const resource of Object.values(player.resources)) resource.ownedCount = 1;
  return { game, player };
}

function build(assignments: Record<number, string | null>, levels: Record<number, number> = { 9: 1, 13: 1, 42: 1 }): Build {
  return { assignments, slotFinalLevels: levels, purchases: {}, lineTotals: {}, artWitness: {}, unlockedArts: [],
    metrics: { upgradeSteps: 0, upgradedSlotCount: 0, purchasedCount: 0, purchaseCost: 0, extraArtsCount: 0, ats: 0, spd: 0 } };
}

function equip(player: PlayerState, game: GameData, characterId: string, candidate: Build) {
  const result = equipBuild(player, game.characters.find((item) => item.id === characterId)!, game.quartz, candidate);
  if (!result.ok) assert.fail(result.message);
  return result.player;
}

function request(game: GameData, player: PlayerState, characterId: string, mode: SolveRequest['resourceMode'] = 'available_only'): SolveRequest {
  const character = game.characters.find((item) => item.id === characterId)!;
  return { character, quartz: [game.quartz[0]], arts: game.arts, resources: player.resources, equipment: player.equipment, resourceMode: mode,
    slotPolicies: Object.fromEntries(character.slots.map((slot) => [slot.id, { currentLevel: 1, maxLevel: 1, allowUpgrade: false }])),
    mustHaveArts: ['tear'], rankingPreset: 'resource', maxResults: 20 };
}

test('equipping reserves inventory, prevents teammate solving, and unequipping restores it', () => {
  const { game, player } = fixture();
  const solved = solveOrbment(request(game, player, 'alice'));
  assert.equal(solved.status, 'solved');
  const equipped = equip(player, game, 'alice', solved.builds[0]);
  assert.equal(getAvailableQuartzCount(equipped.resources, equipped.equipment, 'water'), 0);
  assert.equal(equipped.resources.water.ownedCount, 1);
  assert.deepEqual(getEquippedCounts(equipped.equipment), { water: 1 });
  assert.equal(solveOrbment(request(game, equipped, 'bob')).status, 'no_solution');
  const released = unequipQuartz(equipped, 'alice');
  assert.equal(getAvailableQuartzCount(released.resources, released.equipment, 'water'), 1);
  assert.equal(solveOrbment(request(game, released, 'bob')).status, 'solved');
  assert.equal(getEquippedCounts(equipped.equipment).water, 1, 'previous state remains immutable');
});

test('owned modes retain teammate copies for planning, but actual equip rejects double booking atomically', () => {
  const { game, player } = fixture();
  const equipped = equip(player, game, 'alice', build({ 9: 'water' }));
  for (const mode of ['owned_only', 'owned_plus_shop'] as const) {
    const planned = solveOrbment(request(game, equipped, 'bob', mode));
    assert.equal(planned.status, 'solved');
    const before = JSON.stringify(equipped);
    const outcome = equipBuild(equipped, game.characters[1], game.quartz, planned.builds[0]);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.message, /可用数量不足/);
    assert.equal(JSON.stringify(equipped), before);
  }
});

test('the current character can reuse its own gear and repeated equip does not consume copies', () => {
  const { game, player } = fixture();
  const equipped = equip(player, game, 'alice', build({ 9: 'water' }));
  const result = solveOrbment(request(game, equipped, 'alice'));
  assert.equal(result.status, 'solved');
  const again = equip(equipped, game, 'alice', result.builds[0]);
  assert.deepEqual(getEquippedCounts(again.equipment), { water: 1 });
  assert.equal(again.resources.water.ownedCount, 1);
  assert.equal(getAvailableQuartzCount(again.resources, again.equipment, 'water', 'alice'), 1);
});

test('two owned copies permit two characters, and single unequip only releases that slot', () => {
  const { game, player } = fixture();
  player.resources.water.ownedCount = 2;
  const alice = equip(player, game, 'alice', build({ 9: 'water', 13: 'wind' }));
  const both = equip(alice, game, 'bob', build({ 9: 'water' }));
  assert.equal(getAvailableQuartzCount(both.resources, both.equipment, 'water'), 0);
  const released = unequipQuartz(both, 'alice', 9);
  assert.equal(getAvailableQuartzCount(released.resources, released.equipment, 'water'), 1);
  assert.equal(released.equipment.alice[13], 'wind');
  assert.equal(released.equipment.bob[9], 'water');
  assert.equal(released.resources.water.ownedCount, 2);
});

test('replacing a loadout releases old gear without affecting a teammate', () => {
  const { game, player } = fixture();
  const first = equip(player, game, 'alice', build({ 9: 'water' }));
  const replacement = equip(first, game, 'alice', build({ 42: 'wind' }));
  assert.deepEqual(replacement.equipment.alice, { 9: null, 13: null, 42: 'wind' });
  assert.equal(getAvailableQuartzCount(replacement.resources, replacement.equipment, 'water'), 1);
  assert.deepEqual(replacement.equipment.bob, player.equipment.bob);
});

test('shop plans with missing inventory are blocked until owned stock is manually increased', () => {
  const { game, player } = fixture();
  player.resources.water.ownedCount = 0;
  player.resources.water.shopAvailable = true;
  player.resources.water.shopPurchaseLimit = 2;
  player.resources.water.shopPrice = 100;
  const candidate = solveOrbment(request(game, player, 'alice', 'owned_plus_shop')).builds[0];
  assert.equal(candidate.purchases.water, 1);
  const before = JSON.stringify(player);
  assert.equal(equipBuild(player, game.characters[0], game.quartz, candidate).ok, false);
  assert.equal(JSON.stringify(player), before);
  assert.equal(solveOrbment(request(game, player, 'alice')).status, 'no_solution', 'available mode does not use shop stock');
  const stocked = { ...player, resources: { ...player.resources, water: { ...player.resources.water, ownedCount: 1 } } };
  const equipped = equip(stocked, game, 'alice', candidate);
  assert.equal(equipped.resources.water.ownedCount, 1);
  assert.equal(equipped.resources.water.shopPurchaseLimit, 2);
});

test('slot upgrades apply only when the entire equipment operation succeeds', () => {
  const { game, player } = fixture();
  const candidate = build({ 42: 'advanced' }, { 9: 1, 13: 1, 42: 2 });
  player.resources.advanced.ownedCount = 0;
  assert.equal(equipBuild(player, game.characters[0], game.quartz, candidate).ok, false);
  assert.equal(player.slotLevels.alice['42'], 1);
  player.resources.advanced.ownedCount = 1;
  const equipped = equip(player, game, 'alice', candidate);
  assert.equal(equipped.slotLevels.alice['42'], 2);
  assert.equal(player.slotLevels.alice['42'], 1);
});

test('available mode handles remaining copies and overbooked input without negative quantities', () => {
  const { game, player } = fixture();
  player.equipment.bob[9] = 'water';
  player.resources.water.ownedCount = 2;
  assert.equal(solveOrbment(request(game, player, 'alice')).status, 'solved');
  player.equipment.bob[13] = 'water';
  assert.equal(solveOrbment(request(game, player, 'alice')).status, 'no_solution');
  player.resources.water.ownedCount = 0;
  assert.equal(getAvailableQuartzCount(player.resources, player.equipment, 'water'), 0);
});

test('equipment normalization removes dangling records and overbooking without creating stock', () => {
  const { game, player } = fixture();
  const normalized = normalizeEquipment(game, player.resources, { alice: { 9: 'water', 13: 'deleted', 99: 'wind' }, bob: { 9: 'water', 13: 'wind' }, deleted: { 9: 'water' } });
  assert.deepEqual(normalized, { alice: { 9: 'water', 13: null, 42: null }, bob: { 9: null, 13: 'wind', 42: null } });
  assert.equal(player.resources.water.ownedCount, 1);
  assert.equal(player.equipment.alice[9], null);
});

test('deleting quartz removes all its equipment records and preserves other gear', () => {
  const { player } = fixture();
  player.equipment.alice = { 9: 'water', 13: 'wind' };
  player.equipment.bob = { 9: 'water' };
  const removed = removeQuartzFromEquipment(player, 'water');
  assert.deepEqual(removed.equipment, { alice: { 9: null, 13: 'wind' }, bob: { 9: null } });
  assert.equal(player.equipment.alice[9], 'water');
});

test('equip rejects outdated quartz, slot restrictions, duplicate names and line quotas', () => {
  const { game, player } = fixture();
  assert.equal(equipBuild(player, game.characters[0], game.quartz, build({ 9: 'deleted' })).ok, false);
  game.characters[0].slots[0].restriction = 'fire';
  assert.equal(equipBuild(player, game.characters[0], game.quartz, build({ 9: 'water' })).ok, false);
  game.characters[0].slots[0].restriction = null;
  assert.equal(equipBuild(player, game.characters[0], game.quartz, build({ 9: 'advanced' })).ok, false);
  game.quartz[0].name = '驱动1'; game.quartz[1].name = ' 驱动１ ';
  assert.equal(equipBuild(player, game.characters[0], game.quartz, build({ 9: 'water', 13: 'wind' })).ok, false);
  game.quartz[0].name = '毒之刃'; game.quartz[1].name = '冻结之刃';
  assert.equal(equipBuild(player, game.characters[0], game.quartz, build({ 13: 'water', 42: 'wind' })).ok, false);
  assert.equal(equipBuild(player, game.characters[0], game.quartz, build({ 9: 'water', 13: 'wind' })).ok, true, 'central quota is independent');
});
