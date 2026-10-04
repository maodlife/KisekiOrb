import { init, killThreads } from 'z3-solver';
import { DEFAULT_GAME_DATA, createDefaultPlayerState } from '../lib/default-data.ts';
import { solveOrbment } from '../lib/solver.ts';
import { equipBuild } from '../lib/equipment.ts';
import { ELEMENTS, type SolveRequest } from '../lib/domain.ts';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const api = await init();
try {
  const game = DEFAULT_GAME_DATA, player = createDefaultPlayerState(game);
  const character = game.characters.find(c => c.id === 'kloe') ?? game.characters[0];
  const request: SolveRequest = { character, quartz: game.quartz, arts: game.arts, resources: player.resources, equipment: player.equipment,
    slotPolicies: Object.fromEntries(character.slots.map(s => [s.id, { currentLevel: s.currentLevel, allowUpgrade: false, maxLevel: s.currentLevel }])),
    resourceMode: 'available_only', mustHaveArts: ['art-water-06', 'art-time-07'], rankingPreset: 'extra_arts', maxResults: 20, timeoutMs: 10_000 };
  const result = await solveOrbment(api, request, { onCandidate: r => console.log(`${r.elapsedMs} ms: ${r.builds[0].metrics.extraArtsCount} 个额外魔法`) });
  assert.equal(result.status, 'solved');
  for (const build of result.builds) {
    assert.equal(equipBuild(player, character, game.quartz, build).ok, true, '所有候选都必须通过正式装备规则');
    const byId = new Map(game.quartz.map(q => [q.id, q]));
    const totals = Object.fromEntries(character.lines.map(line => [line.id, Object.fromEntries(ELEMENTS.map(e => [e,
      line.slots.reduce((n, id) => n + (byId.get(build.assignments[id] ?? '')?.elements[e] ?? 0), 0)]))]));
    assert.deepEqual(build.lineTotals, totals);
    const unlocked = game.arts.filter(a => character.lines.some(line => ELEMENTS.every(e => totals[line.id][e] >= a.requirements[e]))).map(a => a.id);
    assert.deepEqual(build.unlockedArts, unlocked);
    assert.ok(request.mustHaveArts.every(id => unlocked.includes(id)));
  }
  const limited = await solveOrbment(api, { ...request, timeoutMs: 300 });
  assert.equal(limited.stopReason, 'time_limit'); assert.ok(limited.builds.length > 0);
  assert.ok(limited.elapsedMs < 1300);
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  const interrupted = await solveOrbment(api, request, { signal: controller.signal, onCandidate: () => { timer ??= setTimeout(() => controller.abort(), 30); } });
  clearTimeout(timer); assert.equal(interrupted.stopReason, 'cancelled'); assert.ok(interrupted.builds.length > 0);
  assert.ok(interrupted.elapsedMs < 1500);
  await mkdir('work', { recursive: true });
  await writeFile('work/z3-benchmark.json', JSON.stringify({ result, limited, interrupted }, null, 2));
  console.log(JSON.stringify({ bestExtras: result.builds[0].metrics.extraArtsCount, firstCandidateMs: result.improvements[0]?.elapsedMs,
    elapsedMs: result.elapsedMs, stopReason: result.stopReason, model: result.model, timeoutBest: limited.builds[0].metrics.extraArtsCount,
    interruptedBest: interrupted.builds[0].metrics.extraArtsCount }));
} finally { await killThreads(api.em); }
