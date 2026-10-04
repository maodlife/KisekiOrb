import type { Bool, Model, init } from 'z3-solver';
import { getQuartzSeries } from './quartz-series.ts';
import { getEquippedCounts } from './equipment.ts';
import { getCentralSlotId, getQuartzLineType } from './quartz-rules.ts';
import { ELEMENTS as elements, type Quartz, type Slot, type SolveRequest, type SolveResult, type SolveProgress, type SolveStopReason, type Build, type ElementValues } from './domain.ts';
export type SolverApi = Pick<Awaited<ReturnType<typeof init>>, 'Context'>;
type EquivalentGroup = { slots: Slot[]; costs: (number | null)[]; memberships: number[] };
export type SolveOptions = { signal?: AbortSignal; onCandidate?: (result: SolveResult) => void; onProgress?: (progress: SolveProgress) => void };
const nameKey = (q: Quartz) => q.name.trim().normalize('NFKC').toLocaleLowerCase('zh-CN') || q.id;
const level = (q: Quartz) => q.quartzLevel ?? 1;

export function failedSolveResult(budgetMs: number, message: string): SolveResult {
  return { status: 'invalid_request', builds: [], attempts: 0, elapsedMs: 0, budgetMs, stopReason: 'invalid_request', extraArtsOptimal: false, improvements: [], message };
}
function validateRequest(request: SolveRequest): string | null {
  if (!request.mustHaveArts.length && !request.mustHaveQuartz?.length) return '请至少选择一个必须回路或必须魔法。';
  if (request.mustHaveArts.some(id => !request.arts.some(a => a.id === id))) return '请求中包含不存在的魔法。';
  if (request.mustHaveQuartz?.some(id => !request.quartz.some(q => q.id === id))) return '请求中包含不存在的必须回路。';
  const center = getCentralSlotId(request.character);
  const ids = new Set(request.character.slots.map(s => s.id));
  if (center !== null && !ids.has(center)) return '中央插槽引用了不存在的物理槽位，请检查角色导力器设置。';
  if (ids.size !== request.character.slots.length || request.character.lines.some(line => line.slots.some(id => !ids.has(id)))) return '导力器槽位或线路引用无效，请检查角色设置。';
  if (request.timeoutMs != null && (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)) return '尝试时间必须大于零。';
  if (request.quartz.some(q => elements.some(e => !Number.isInteger(q.elements[e]) || q.elements[e] < 0)) || request.arts.some(a => elements.some(e => !Number.isInteger(a.requirements[e]) || a.requirements[e] < 0))) return '回路元素值和魔法需求必须是非负整数。';
  if (request.character.slots.some(s => !request.slotPolicies[s.id])) return '缺少槽位策略，请重新选择角色。';
  return null;
}

// Swap-equivalent physical slots share variables; central exemptions stay separate.
function equivalentGroups(request: SolveRequest, quartz: Quartz[], available: (q: Quartz) => number) {
  const lines = request.character.lines;
  const ids = new Set(request.character.slots.map(s => s.id));
  for (const line of lines) for (const id of line.slots) if (!ids.has(id)) throw new Error(`线路包含不存在的槽位 ${id}`);
  const groups = new Map<string, EquivalentGroup>();
  const center = getCentralSlotId(request.character);
  for (const slot of request.character.slots) {
    const policy = request.slotPolicies[slot.id];
    const costs = quartz.map(q => !available(q) || level(q) > (policy.allowUpgrade ? policy.maxLevel : policy.currentLevel)
      || (slot.restriction && getQuartzSeries(q) !== slot.restriction) ? null : Math.max(0, level(q) - policy.currentLevel));
    const memberships = lines.map(line => line.slots.filter(id => id === slot.id).length);
    const signature = JSON.stringify([costs, memberships, slot.id === center]);
    if (!groups.has(signature)) groups.set(signature, { slots: [], costs, memberships });
    groups.get(signature)!.slots.push(slot);
  }
  return [...groups.values()];
}

export async function solveOrbment(api: SolverApi, request: SolveRequest, { onCandidate = () => {}, onProgress = () => {}, signal }: SolveOptions = {}): Promise<SolveResult> {
  const invalid = validateRequest(request);
  if (invalid) return failedSolveResult(request.timeoutMs ?? 10_000, invalid);
  const started = performance.now();
  const budgetMs = Math.max(1, Math.floor(request.timeoutMs ?? 10_000));
  const quartz = [...request.quartz].sort((a, b) => a.id.localeCompare(b.id));
  const slots = request.character.slots;
  const teammateCounts = getEquippedCounts(request.equipment, request.character.id);
  const available = (q: Quartz) => {
    const r = request.resources[q.id];
    if (!r) return 0;
    const owned = Math.max(0, r.ownedCount - (request.resourceMode === 'available_only' ? (teammateCounts[q.id] ?? 0) : 0));
    return request.resourceMode === 'owned_plus_shop' && r.shopAvailable
      ? owned + (r.shopPurchaseLimit == null ? slots.length : Math.max(0, r.shopPurchaseLimit)) : owned;
  };
  const groups = equivalentGroups(request, quartz, available);
  const ctx = new api.Context('orbment');
  const { Bool, And, Or } = ctx;
  // Finite Boolean/pseudo-Boolean feasibility checks, with no Optimize objectives.
  const solver = new ctx.Solver('QF_FD');
  const interrupt = () => ctx.interrupt();
  signal?.addEventListener('abort', interrupt, { once: true });
  const vars = groups.map((group, g) => quartz.map((q, i) => group.costs[i] == null ? null : Bool.const(`equip_${g}_${i}`)));
  const atMost = (xs: Bool<'orbment'>[], count: number) => { if (xs.length > count) solver.add(ctx.AtMost(xs as [Bool<'orbment'>, ...Bool<'orbment'>[]], count)); };
  const used = quartz.map((q, i) => vars.map(row => row[i]).filter(x => x !== null));
  const mustHave = new Set(request.mustHaveArts);
  const trace: { elapsedMs: number; target: number; build: Build }[] = [];
  let stopReason: SolveStopReason = 'time_limit', attempts = 0, extraArtsOptimal = false;
  try {
    groups.forEach((group, g) => atMost(vars[g].filter(x => x !== null), group.slots.length));
    quartz.forEach((q, i) => atMost(used[i], Math.min(available(q), q.uniqueEquip ? 1 : slots.length)));
    // Required quartz must occupy a physical slot; they cannot be replaced by
    // another quartz with matching elements, name or series.
    for (const id of new Set(request.mustHaveQuartz ?? [])) {
      const xs = used[quartz.findIndex(q => q.id === id)];
      solver.add(xs.length ? Or(...xs) : Bool.val(false));
    }
    for (const field of ['name', 'family']) {
      const sets = new Map<string, Bool<'orbment'>[]>();
      quartz.forEach((q, i) => {
        const key = field === 'name' ? nameKey(q) : q.family;
        if (key) sets.set(key, [...(sets.get(key) ?? []), ...used[i]]);
      });
      for (const xs of sets.values()) atMost(xs, 1);
    }
    const center = getCentralSlotId(request.character);
    for (const [l] of request.character.lines.entries()) for (const type of ['blade', 'shield', 'reason'] as const) {
      const xs = groups.flatMap((group, g) => group.slots[0].id === center || !group.memberships[l] ? []
        : quartz.flatMap((q, i) => getQuartzLineType(q) === type && vars[g][i] ? [vars[g][i]!] : []));
      atMost(xs, 1);
    }
    const unlocks = request.arts.map((art, a) => {
      const witnesses = request.character.lines.flatMap((line, l) => {
        const conditions: Bool<'orbment'>[] = [];
        for (const e of elements) {
          const requirement = art.requirements[e] ?? 0;
          if (requirement <= 0) continue;
          const xs: Bool<'orbment'>[] = [], weights: number[] = [];
          let upper = 0;
          groups.forEach((group, g) => {
            let highest = 0;
            quartz.forEach((q, i) => {
              const weight = group.memberships[l] * (q.elements[e] ?? 0);
              if (vars[g][i] && weight > 0) { xs.push(vars[g][i]!); weights.push(weight); highest = Math.max(highest, weight); }
            });
            upper += highest * group.slots.length;
          });
          if (upper < requirement) return [];
          conditions.push(ctx.PbGe(xs as [Bool<'orbment'>, ...Bool<'orbment'>[]], weights as [number, ...number[]], requirement));
        }
        return [conditions.length ? And(...conditions) : Bool.val(true)];
      });
      const x = Bool.const(`art_${a}`);
      solver.add(x.eq(witnesses.length ? Or(...witnesses) : Bool.val(false)));
      return x;
    });
    for (const id of mustHave) {
      const index = request.arts.findIndex(a => a.id === id);
      if (index < 0) throw new Error(`不存在的魔法 ${id}`);
      solver.add(unlocks[index]);
    }
    const extras = unlocks.filter((x, i) => !mustHave.has(request.arts[i].id));
    const modelStats = { physicalSlots: slots.length, equivalentSlotGroups: groups.length,
      equipmentVariables: vars.flat().filter(x => x !== null).length };
    const decode = (model: Model<'orbment'>): Build => {
      const isTrue = (x: Bool<'orbment'>) => ctx.isTrue(model.eval(x, true));
      const assignments: Record<number, string | null> = Object.fromEntries(slots.map(s => [s.id, null]));
      groups.forEach((group, g) => {
        const selected = quartz.filter((q, i) => vars[g][i] && isTrue(vars[g][i]!));
        // Canonical placement is a decoding convention, not a solver objective.
        selected.forEach((q, i) => { assignments[group.slots[i].id] = q.id; });
      });
      const byId = new Map(quartz.map(q => [q.id, q]));
      const equipped = slots.map(s => byId.get(assignments[s.id] ?? ''));
      const purchases: Record<string, number> = {};
      for (const q of equipped.filter((q): q is Quartz => q !== undefined)) {
        const count = equipped.filter(other => other?.id === q.id).length;
        const bought = Math.max(0, count - (request.resources[q.id]?.ownedCount ?? 0));
        if (bought) purchases[q.id] = bought;
      }
      const slotFinalLevels = Object.fromEntries(slots.map((s, i) => [s.id, Math.max(request.slotPolicies[s.id].currentLevel, equipped[i] ? level(equipped[i]) : 0)]));
      const unlockedArts = request.arts.filter((a, i) => isTrue(unlocks[i])).map(a => a.id);
      const lineTotals = Object.fromEntries(request.character.lines.map(line => [line.id, Object.fromEntries(elements.map(e => [e,
        line.slots.reduce((n, id) => n + (byId.get(assignments[id] ?? '')?.elements[e] ?? 0), 0)])) as ElementValues]));
      const upgradeSteps = slots.reduce((n, s) => n + slotFinalLevels[s.id] - request.slotPolicies[s.id].currentLevel, 0);
      const upgradedSlotCount = slots.filter(s => slotFinalLevels[s.id] > request.slotPolicies[s.id].currentLevel).length;
      const metrics = { upgradeSteps, upgradedSlotCount, purchasedCount: Object.values(purchases).reduce((n, count) => n + count, 0),
        purchaseCost: Object.entries(purchases).reduce((n, [id, count]) => n + count * (request.resources[id]?.shopPrice ?? 0), 0),
        extraArtsCount: unlockedArts.filter(id => !mustHave.has(id)).length,
        ats: equipped.reduce((n, q) => n + (q?.stats?.ats ?? 0), 0), spd: equipped.reduce((n, q) => n + (q?.stats?.spd ?? 0), 0) };
      const artWitness = Object.fromEntries(request.arts.filter(a => unlockedArts.includes(a.id)).map(a => [a.id,
        request.character.lines.find(line => elements.every(e => lineTotals[line.id][e] >= (a.requirements[e] ?? 0)))!.id]));
      return { assignments, slotFinalLevels, purchases, lineTotals, unlockedArts, artWitness, metrics };
    };
    let target = 0;
    while (true) {
      if (signal?.aborted) { stopReason = 'cancelled'; break; }
      const remaining = Math.floor(budgetMs - (performance.now() - started));
      if (remaining <= 0) break;
      onProgress({ phase: 'searching', message: target ? `正在尝试至少 ${target} 个额外魔法` : '正在寻找第一个合法方案', elapsedMs: Math.round(performance.now() - started), budgetMs, target, attempts, bestExtraArtsCount: trace.at(-1)?.build.metrics.extraArtsCount ?? null });
      solver.set('timeout', remaining);
      attempts++;
      const status = await solver.check();
      if (signal?.aborted) { stopReason = 'cancelled'; break; }
      if (status === 'unsat') { stopReason = trace.length ? 'no_better' : 'no_solution'; extraArtsOptimal = trace.length > 0; break; }
      if (status === 'unknown') {
        const reason = solver.reasonUnknown();
        stopReason = /timeout|canceled/i.test(reason) || performance.now() - started >= budgetMs ? 'time_limit' : 'solver_unknown';
        break;
      }
      const build = decode(solver.model());
      trace.push({ elapsedMs: Math.round(performance.now() - started), target, build });
      onCandidate({ status: 'solved', builds: trace.slice(-(request.maxResults ?? 20)).reverse().map(record => record.build), attempts, elapsedMs: Math.round(performance.now() - started), budgetMs, stopReason: 'searching', extraArtsOptimal: false, message: `当前最佳：${build.metrics.extraArtsCount} 个额外魔法，继续尝试改善。`, model: modelStats, improvements: trace.map(record => ({ elapsedMs: record.elapsedMs, extraArtsCount: record.build.metrics.extraArtsCount })) });
      if (signal?.aborted) { stopReason = 'cancelled'; break; }
      target = build.metrics.extraArtsCount + 1;
      if (target > extras.length) { stopReason = 'no_better'; extraArtsOptimal = true; break; }
      // Raise the required minimum. Every new SAT model strictly improves extras.
      solver.add(ctx.AtLeast(extras as [Bool<'orbment'>, ...Bool<'orbment'>[]], target));
    }
    const best = trace.at(-1)?.build.metrics.extraArtsCount;
    const reasons: Partial<Record<SolveStopReason, string>> = {
      time_limit: trace.length ? `已到尝试时间上限，最佳 ${best} 个额外魔法。` : '已到尝试时间上限，暂未找到合法方案；这不代表无解。',
      no_better: `最佳 ${best} 个额外魔法，已证明无法增加数量。`,
      no_solution: '未找到满足全部必选条件的合法配置（已证明约束无解）。',
      cancelled: trace.length ? `已取消，保留最佳 ${best} 个额外魔法的方案。` : '已取消，尚未找到合法方案。',
      solver_unknown: trace.length ? `本次尝试未完成，保留最佳 ${best} 个额外魔法的方案。` : '本次尝试未完成，暂未找到合法方案。',
    };
    return { status: trace.length ? 'solved' : stopReason === 'no_solution' ? 'no_solution' : signal?.aborted ? 'cancelled' : 'unknown',
      budgetMs, stopReason, message: reasons[stopReason]!,
      builds: trace.slice(-(request.maxResults ?? 20)).reverse().map(record => record.build),
      improvements: trace.map(record => ({ elapsedMs: record.elapsedMs, extraArtsCount: record.build.metrics.extraArtsCount })), extraArtsOptimal,
      elapsedMs: Math.round(performance.now() - started), attempts, model: modelStats };
  } finally { signal?.removeEventListener('abort', interrupt); solver.release(); }
}
