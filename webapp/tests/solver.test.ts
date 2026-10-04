import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyElements, type Art, type Character, type ElementKey, type Quartz, type SolveRequest } from '../lib/domain.ts';
import { solveOrbment } from './solver-api.ts';

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
    mustHaveArts: options.must ?? arts.map((item) => item.id), rankingPreset: 'resource', maxResults: 20, timeoutMs: 5000,
  };
}

test('unlocks an art on a single line', async () => {
  const result = (await solveOrbment(request()));
  assert.equal(result.status, 'solved');
  assert.equal(result.builds[0].artWitness.tear, 'L1');
});

test('a shared physical slot contributes to two lines', async () => {
  const character = request().character;
  character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }, { id: 'L2', name: 'L2', slots: [0, 2] }];
  const result = (await solveOrbment(request({ character, quartz: [q('shared', { water: 3, wind: 3 })], arts: [art('water', { water: 3 }), art('wind', { wind: 3 })] })));
  assert.equal(result.status, 'solved');
  const sharedBuild = result.builds.find((build) => build.assignments[0] === 'shared');
  assert.ok(sharedBuild);
  assert.ok(sharedBuild.lineTotals.L1.water >= 3 && sharedBuild.lineTotals.L2.wind >= 3);
});

test('a locally shared slot only contributes to lines that reference it', async () => {
  const character = request().character;
  character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }, { id: 'L2', name: 'L2', slots: [1, 2] }, { id: 'L3', name: 'L3', slots: [0, 2] }];
  character.slots[0].restriction = 'earth'; character.slots[2].restriction = 'earth';
  const result = (await solveOrbment(request({ character, quartz: [q('shared', { space: 4 })], arts: [art('space', { space: 4 })] })));
  assert.equal(result.status, 'solved');
  const build = result.builds.find((item) => item.assignments[1] === 'shared');
  assert.ok(build);
  assert.equal(build.lineTotals.L1.space, 4);
  assert.equal(build.lineTotals.L2.space, 4);
  assert.equal(build.lineTotals.L3.space, 0);
});

test('different must-have arts may be witnessed by different lines', async () => {
  const character = request().character;
  character.lines = [{ id: 'L1', name: 'L1', slots: [0] }, { id: 'L2', name: 'L2', slots: [1] }];
  const result = (await solveOrbment(request({ character, quartz: [q('water', { water: 3 }), q('fire', { fire: 3 })], arts: [art('tear', { water: 3 }), art('bolt', { fire: 3 })] })));
  assert.equal(result.status, 'solved');
  assert.notEqual(result.builds[0].artWitness.tear, result.builds[0].artWitness.bolt);
});

test('owned quantity prevents duplicate use', async () => {
  const character = request().character; character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }];
  const result = (await solveOrbment(request({ character, quartz: [q('water', { water: 2 })], arts: [art('tear', { water: 4 })], owned: { water: 1 } })));
  assert.equal(result.status, 'no_solution');
});

test('shop mode creates the correct purchase count', async () => {
  const character = request().character; character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }];
  const result = (await solveOrbment(request({ character, quartz: [q('water-owned', { water: 2 }), q('water-shop', { water: 2 })], arts: [art('tear', { water: 4 })], owned: { 'water-owned': 1, 'water-shop': 0 }, shop: ['water-shop'], mode: 'owned_plus_shop' })));
  assert.equal(result.status, 'solved');
  assert.equal(result.builds[0].purchases['water-shop'], 1);
});

test('quartz with the same display name cannot be equipped more than once', async () => {
  const character = request().character; character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }];
  const first = q('cast-original', { time: 2 });
  const second = q('cast-copy', { time: 2 });
  first.name = '驱动1'; second.name = ' 驱动１ ';
  const result = (await solveOrbment(request({ character, quartz: [first, second], arts: [art('clock', { time: 4 })], owned: { 'cast-original': 1, 'cast-copy': 1 } })));
  assert.equal(result.status, 'no_solution');
});

test('shop availability never makes one named quartz repeatable', async () => {
  const character = request().character; character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }];
  const result = (await solveOrbment(request({ character, quartz: [q('cast1', { time: 2 })], arts: [art('clock', { time: 4 })], owned: { cast1: 0 }, shop: ['cast1'], mode: 'owned_plus_shop' })));
  assert.equal(result.status, 'no_solution');
});

test('owned-only mode never buys quartz', async () => {
  assert.equal((await solveOrbment(request({ owned: { water: 0 }, shop: ['water'], mode: 'owned_only' }))).status, 'no_solution');
});

test('quartz above a fixed slot level cannot be equipped', async () => {
  assert.equal((await solveOrbment(request({ quartz: [q('advanced', { water: 3 }, 2)], owned: { advanced: 1 } }))).status, 'no_solution');
});

test('allowing an upgrade can create a solution and records it', async () => {
  const result = (await solveOrbment(request({ quartz: [q('advanced', { water: 3 }, 2)], owned: { advanced: 1 }, upgrades: { 0: 2 } })));
  assert.equal(result.status, 'solved'); assert.equal(result.builds[0].slotFinalLevels[0], 2); assert.equal(result.builds[0].metrics.upgradeSteps, 1);
});

test('a slot without upgrade permission is never changed', async () => {
  const result = (await solveOrbment(request({ quartz: [q('advanced', { water: 3 }, 2), q('basic', { water: 3 })], owned: { advanced: 1, basic: 1 } })));
  assert.equal(result.status, 'solved'); assert.equal(result.builds[0].slotFinalLevels[0], 1);
});

test('element restrictions are enforced by quartz series', async () => {
  const character = request().character; character.lines = [{ id: 'L1', name: 'L1', slots: [0] }]; character.slots[0].restriction = 'water';
  const mixed = q('mixed', { water: 3, wind: 3 }); mixed.series = 'wind';
  assert.equal((await solveOrbment(request({ character, quartz: [mixed], arts: [art('water', { water: 3 })] }))).status, 'no_solution');
});

test('a quartz with unknown level is usable without an upgrade', async () => {
  const unknownLevel = q('unknown', { water: 3 }); unknownLevel.quartzLevel = null; unknownLevel.uniqueEquip = null;
  assert.equal((await solveOrbment(request({ quartz: [unknownLevel], owned: { unknown: 1 } }))).status, 'solved');
});

test('family and unique rules are enforced', async () => {
  const character = request().character; character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1, 2] }];
  const quartz = [q('mind1', { water: 2 }, 1, 'mind'), q('mind2', { water: 2 }, 1, 'mind'), q('unique', { water: 1 }, 1, null, true)];
  const result = (await solveOrbment(request({ character, quartz, arts: [art('tear', { water: 5 })], owned: { mind1: 1, mind2: 1, unique: 2 } })));
  assert.equal(result.status, 'no_solution');
});

for (const [first, second] of [['毒之刃', '冻结之刃'], ['黄玉之盾', '苍玉之盾'], ['毒之理', '冻结之理']]) {
  test(`one line cannot equip both ${first} and ${second}, including shop mode`, async () => {
    const character = request().character;
    character.centralSlotId = null;
    character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }];
    const quartz = [q(first, { water: 2 }), q(second, { water: 2 })];
    const arts = [art('water', { water: 4 })];
    assert.equal((await solveOrbment(request({ character, quartz, arts }))).status, 'no_solution');
    assert.equal((await solveOrbment(request({ character, quartz, arts, owned: { [first]: 0, [second]: 0 }, shop: [first, second], mode: 'owned_plus_shop' }))).status, 'no_solution');
  });
}

test('blade, shield and reason are separate quotas on the same line', async () => {
  const character = request().character;
  character.centralSlotId = null;
  const quartz = [q('毒之刃', { water: 2 }), q('苍玉之盾', { water: 2 }), q('冻结之理', { water: 2 })];
  const result = (await solveOrbment(request({ character, quartz, arts: [art('water', { water: 6 })] })));
  assert.equal(result.status, 'solved');
  assert.equal(result.builds.length, 1);
  assert.ok(result.builds.every((build) => build.lineTotals.L1.water === 6));
});

test('different lines may equip the same type regardless of candidate input order', async () => {
  const character = request().character;
  character.centralSlotId = null;
  character.lines = [{ id: 'L1', name: 'L1', slots: [0] }, { id: 'L2', name: 'L2', slots: [1] }];
  const quartz = [q('毒之刃', { water: 2 }), q('冻结之刃', { fire: 2 })];
  const arts = [art('water', { water: 2 }), art('fire', { fire: 2 })];
  for (const candidates of [quartz, [...quartz].reverse()]) {
    const result = (await solveOrbment(request({ character, quartz: candidates, arts })));
    assert.equal(result.status, 'solved');
    assert.equal(result.builds.length, 1);
    assert.notEqual(result.builds[0].assignments[0], result.builds[0].assignments[1]);
  }
});

test('the center has an independent quota while its elements still contribute to every line', async () => {
  const character = request().character;
  character.centralSlotId = 0;
  character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }, { id: 'L2', name: 'L2', slots: [0, 2] }];
  const quartz = [q('毒之刃', { water: 2 }), q('冻结之刃', { fire: 2 }), q('石化之刃', { wind: 2 })];
  const arts = [art('water-fire', { water: 2, fire: 2 }), art('water-wind', { water: 2, wind: 2 })];
  const result = (await solveOrbment(request({ character, quartz, arts })));
  assert.equal(result.status, 'solved');
  assert.equal(result.builds.length, 1);
  for (const build of result.builds) {
    assert.equal(build.assignments[0], '毒之刃');
    assert.equal(build.lineTotals.L1.water, 2);
    assert.equal(build.lineTotals.L2.water, 2);
    assert.notEqual(build.artWitness['water-fire'], build.artWitness['water-wind']);
  }
});

test('one line cannot use a third blade even with a separate center quota', async () => {
  const character = request().character;
  character.centralSlotId = 0;
  const result = (await solveOrbment(request({ character, quartz: [q('毒之刃', { water: 2 }), q('冻结之刃', { water: 2 }), q('石化之刃', { water: 2 })], arts: [art('water', { water: 6 })] })));
  assert.equal(result.status, 'no_solution');
});

test('a nonzero center ID works even when branch slots are searched before it', async () => {
  const character = request().character;
  character.slots = character.slots.map((slot, index) => ({ ...slot, id: [42, 9, 13][index], restriction: ([null, 'fire', 'wind'] as const)[index] }));
  character.centralSlotId = 42;
  character.lines = [{ id: 'L1', name: 'L1', slots: [42, 9] }, { id: 'L2', name: 'L2', slots: [42, 13] }];
  const result = (await solveOrbment(request({ character, quartz: [q('毒之刃', { water: 2 }), q('冻结之刃', { fire: 2 }), q('石化之刃', { wind: 2 })], arts: [art('water-fire', { water: 2, fire: 2 }), art('water-wind', { water: 2, wind: 2 })] })));
  assert.equal(result.status, 'solved');
  assert.equal(result.builds[0].assignments[42], '毒之刃');
  assert.equal(result.builds[0].assignments[9], '冻结之刃');
  assert.equal(result.builds[0].assignments[13], '石化之刃');
});

test('a noncentral shared slot consumes the type quota on every line that references it', async () => {
  const character = request().character;
  character.centralSlotId = null;
  character.slots[0].restriction = 'earth';
  character.slots[1].restriction = 'water';
  character.slots[2].restriction = 'water';
  character.lines = [{ id: 'L1', name: 'L1', slots: [0, 1] }, { id: 'L2', name: 'L2', slots: [0, 2] }];
  const shared = q('毒之刃', { earth: 3, water: 2 });
  const branch = q('冻结之刃', { water: 2 });
  const result = (await solveOrbment(request({ character, quartz: [shared, branch], arts: [art('water', { water: 4 })] })));
  assert.equal(result.status, 'no_solution');
});

test('ordinary quartz can coexist and keep their existing quantity and name rules', async () => {
  const character = request().character;
  character.centralSlotId = null;
  const result = (await solveOrbment(request({ character, quartz: [q('慈爱', { water: 2 }), q('瀑布', { water: 2 }), q('牙城', { water: 2 })], arts: [art('water', { water: 6 })] })));
  assert.equal(result.status, 'solved');
});

test('invalid central slot references are reported as a request error', async () => {
  const character = request().character;
  character.centralSlotId = 99;
  const result = (await solveOrbment(request({ character })));
  assert.equal(result.status, 'invalid_request');
  assert.match(result.message, /中央插槽/);
});

test('no solution returns an explicit status and message', async () => {
  const result = (await solveOrbment(request({ arts: [art('impossible', { mirage: 99 })] })));
  assert.equal(result.status, 'no_solution'); assert.deepEqual(result.builds, []); assert.match(result.message, /未找到/);
});

test('incremental extra arts matches independent exhaustive physical-slot assignments', async () => {
  const quartz = [q('water', { water: 3 }), q('clock', { time: 3 }), q('mixed', { water: 2, time: 1 }), q('wind', { wind: 3 })];
  const arts = [art('goal-water', { water: 3 }), art('goal-time', { time: 3 }), art('extra-water', { water: 5 }), art('extra-time', { time: 4 }), art('extra-wind', { wind: 3 })];
  const r = request({ quartz, arts, must: ['goal-water', 'goal-time'] }); r.maxResults = 1;
  let best = -1; const choices = [null, ...quartz];
  for (const a of choices) for (const b of choices) for (const c of choices) {
    const selected = [a, b, c].filter(q => q !== null);
    if (new Set(selected.map(q => q.id)).size !== selected.length) continue;
    const totals = Object.fromEntries(Object.keys(emptyElements()).map(e => [e, selected.reduce((n, q) => n + q.elements[e as ElementKey], 0)]));
    const unlocked = arts.filter(art => Object.keys(emptyElements()).every(e => totals[e] >= art.requirements[e as ElementKey]));
    if (!r.mustHaveArts.every(id => unlocked.some(a => a.id === id))) continue;
    best = Math.max(best, unlocked.filter(a => !r.mustHaveArts.includes(a.id)).length);
  }
  const candidates: number[] = [];
  const result = await solveOrbment(r, { onCandidate: result => candidates.push(result.builds[0].metrics.extraArtsCount) });
  assert.equal(result.builds[0].metrics.extraArtsCount, best); assert.equal(result.extraArtsOptimal, true);
  assert.equal(result.model?.equivalentSlotGroups, 1); assert.equal(result.builds.length, 1);
  assert.ok(candidates.every((n, i) => !i || n > candidates[i - 1]));
});
test('slots with different upgrade costs must not be merged', async () => {
  const r = request({ quartz: [q('advanced', { water: 3 }, 2)], arts: [art('goal', { water: 3 })], upgrades: { 0: 2, 1: 2, 2: 2 } });
  r.slotPolicies[1].currentLevel = 2; r.slotPolicies[2].currentLevel = 2;
  const result = await solveOrbment(r); assert.equal(result.model?.equivalentSlotGroups, 2);
});
test('timeout without a candidate never claims the constraints are unsatisfiable', async () => {
  const r = request(); r.timeoutMs = 0.001;
  const result = await solveOrbment(r); assert.equal(result.status, 'unknown'); assert.equal(result.stopReason, 'time_limit');
});
test('cancellation preserves a candidate and does not claim optimality', async () => {
  const controller = new AbortController();
  const result = await solveOrbment(request(), { signal: controller.signal, onCandidate: () => controller.abort() });
  assert.equal(result.status, 'solved'); assert.equal(result.stopReason, 'cancelled');
  assert.ok(result.builds.length > 0); assert.equal(result.extraArtsOptimal, false);
});
