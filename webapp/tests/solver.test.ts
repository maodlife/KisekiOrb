import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyElements, type Art, type Character, type ElementKey, type Quartz, type SolveRequest } from '../lib/domain.ts';
import { solveOrbment } from '../lib/solver.ts';

const elements = (values: Partial<Record<ElementKey, number>>) => ({ ...emptyElements(), ...values });
const q = (id: string, values: Partial<Record<ElementKey, number>>, level = 1, family: string | null = null, uniqueEquip = false): Quartz => ({ id, name: id, family, quartzLevel: level, elements: elements(values), stats: {}, tags: [], uniqueEquip });
const art = (id: string, values: Partial<Record<ElementKey, number>>): Art => ({ id, name: id, requirements: elements(values), epCost: 0, category: 'test' });

function request(options: { character?: Character; quartz?: Quartz[]; arts?: Art[]; must?: string[]; owned?: Record<string, number>; shop?: string[]; mode?: 'owned_only' | 'owned_plus_shop'; upgrades?: Record<number, number> } = {}): SolveRequest {
  const character = options.character ?? { id: 'toy', name: 'Toy', slots: [0, 1, 2].map((id) => ({ id, x: id * 20, y: 50, currentLevel: 1, maxGameLevel: 3, restriction: null })), lines: [{ id: 'L1', name: 'L1', slots: [0, 1, 2] }] };
  const quartz = options.quartz ?? [q('water', { water: 3 })];
  const arts = options.arts ?? [art('tear', { water: 3 })];
  return {
    character, quartz, arts,
    resources: Object.fromEntries(quartz.map((item) => [item.id, { quartzId: item.id, ownedCount: options.owned?.[item.id] ?? 1, shopAvailable: options.shop?.includes(item.id) ?? false, shopPrice: 100, shopPurchaseLimit: null }])),
    resourceMode: options.mode ?? 'owned_only',
    slotPolicies: Object.fromEntries(character.slots.map((slot) => [slot.id, { currentLevel: slot.currentLevel, allowUpgrade: options.upgrades?.[slot.id] != null, maxLevel: options.upgrades?.[slot.id] ?? slot.currentLevel }])),
    mustHaveArts: options.must ?? arts.map((item) => item.id), rankingPreset: 'resource', maxResults: 20, maxNodes: 50_000,
  };
}

test('unlocks an art on a single line', () => {
  const result = solveOrbment(request());
  assert.equal(result.status, 'solved');
  assert.equal(result.builds[0].artWitness.tear, 'L1');
});

test('a shared physical slot contributes to two lines', () => {
  const character = request().character;
  character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }, { id: 'L2', name: 'L2', slots: [0, 2] }];
  const result = solveOrbment(request({ character, quartz: [q('shared', { water: 3, wind: 3 })], arts: [art('water', { water: 3 }), art('wind', { wind: 3 })] }));
  assert.equal(result.status, 'solved');
  const sharedBuild = result.builds.find((build) => build.assignments[0] === 'shared');
  assert.ok(sharedBuild);
  assert.ok(sharedBuild.lineTotals.L1.water >= 3 && sharedBuild.lineTotals.L2.wind >= 3);
});

test('a locally shared slot only contributes to lines that reference it', () => {
  const character = request().character;
  character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }, { id: 'L2', name: 'L2', slots: [1, 2] }, { id: 'L3', name: 'L3', slots: [0, 2] }];
  const result = solveOrbment(request({ character, quartz: [q('shared', { space: 4 })], arts: [art('space', { space: 4 })] }));
  assert.equal(result.status, 'solved');
  const build = result.builds.find((item) => item.assignments[1] === 'shared');
  assert.ok(build);
  assert.equal(build.lineTotals.L1.space, 4);
  assert.equal(build.lineTotals.L2.space, 4);
  assert.equal(build.lineTotals.L3.space, 0);
});

test('different must-have arts may be witnessed by different lines', () => {
  const character = request().character;
  character.lines = [{ id: 'L1', name: 'L1', slots: [0] }, { id: 'L2', name: 'L2', slots: [1] }];
  const result = solveOrbment(request({ character, quartz: [q('water', { water: 3 }), q('fire', { fire: 3 })], arts: [art('tear', { water: 3 }), art('bolt', { fire: 3 })] }));
  assert.equal(result.status, 'solved');
  assert.notEqual(result.builds[0].artWitness.tear, result.builds[0].artWitness.bolt);
});

test('owned quantity prevents duplicate use', () => {
  const character = request().character; character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }];
  const result = solveOrbment(request({ character, quartz: [q('water', { water: 2 })], arts: [art('tear', { water: 4 })], owned: { water: 1 } }));
  assert.equal(result.status, 'no_solution');
});

test('shop mode creates the correct purchase count', () => {
  const character = request().character; character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }];
  const result = solveOrbment(request({ character, quartz: [q('water-owned', { water: 2 }), q('water-shop', { water: 2 })], arts: [art('tear', { water: 4 })], owned: { 'water-owned': 1, 'water-shop': 0 }, shop: ['water-shop'], mode: 'owned_plus_shop' }));
  assert.equal(result.status, 'solved');
  assert.equal(result.builds[0].purchases['water-shop'], 1);
});

test('quartz with the same display name cannot be equipped more than once', () => {
  const character = request().character; character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }];
  const first = q('cast-original', { time: 2 });
  const second = q('cast-copy', { time: 2 });
  first.name = '驱动1'; second.name = ' 驱动１ ';
  const result = solveOrbment(request({ character, quartz: [first, second], arts: [art('clock', { time: 4 })], owned: { 'cast-original': 1, 'cast-copy': 1 } }));
  assert.equal(result.status, 'no_solution');
});

test('shop availability never makes one named quartz repeatable', () => {
  const character = request().character; character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }];
  const result = solveOrbment(request({ character, quartz: [q('cast1', { time: 2 })], arts: [art('clock', { time: 4 })], owned: { cast1: 0 }, shop: ['cast1'], mode: 'owned_plus_shop' }));
  assert.equal(result.status, 'no_solution');
});

test('owned-only mode never buys quartz', () => {
  assert.equal(solveOrbment(request({ owned: { water: 0 }, shop: ['water'], mode: 'owned_only' })).status, 'no_solution');
});

test('quartz above a fixed slot level cannot be equipped', () => {
  assert.equal(solveOrbment(request({ quartz: [q('advanced', { water: 3 }, 2)], owned: { advanced: 1 } })).status, 'no_solution');
});

test('allowing an upgrade can create a solution and records it', () => {
  const result = solveOrbment(request({ quartz: [q('advanced', { water: 3 }, 2)], owned: { advanced: 1 }, upgrades: { 0: 2 } }));
  assert.equal(result.status, 'solved'); assert.equal(result.builds[0].slotFinalLevels[0], 2); assert.equal(result.builds[0].metrics.upgradeSteps, 1);
});

test('a slot without upgrade permission is never changed', () => {
  const result = solveOrbment(request({ quartz: [q('advanced', { water: 3 }, 2), q('basic', { water: 3 })], owned: { advanced: 1, basic: 1 } }));
  assert.equal(result.status, 'solved'); assert.equal(result.builds[0].slotFinalLevels[0], 1);
});

test('element restrictions are enforced by quartz series', () => {
  const character = request().character; character.lines = [{ id: 'L1', name: 'L1', slots: [0] }]; character.slots[0].restriction = 'water';
  const mixed = q('mixed', { water: 3, wind: 3 }); mixed.series = 'wind';
  assert.equal(solveOrbment(request({ character, quartz: [mixed], arts: [art('water', { water: 3 })] })).status, 'no_solution');
});

test('a quartz with unknown level is usable without an upgrade', () => {
  const unknownLevel = q('unknown', { water: 3 }); unknownLevel.quartzLevel = null; unknownLevel.uniqueEquip = null;
  assert.equal(solveOrbment(request({ quartz: [unknownLevel], owned: { unknown: 1 } })).status, 'solved');
});

test('family and unique rules are enforced', () => {
  const character = request().character; character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1, 2] }];
  const quartz = [q('mind1', { water: 2 }, 1, 'mind'), q('mind2', { water: 2 }, 1, 'mind'), q('unique', { water: 1 }, 1, null, true)];
  const result = solveOrbment(request({ character, quartz, arts: [art('tear', { water: 5 })], owned: { mind1: 1, mind2: 1, unique: 2 } }));
  assert.equal(result.status, 'no_solution');
});

test('no solution returns an explicit status and message', () => {
  const result = solveOrbment(request({ arts: [art('impossible', { mirage: 99 })] }));
  assert.equal(result.status, 'no_solution'); assert.deepEqual(result.builds, []); assert.match(result.message, /未找到/);
});
