import { getQuartzSeries } from './quartz-series.ts';
import { getEquippedCounts } from './equipment.ts';
import { getCentralSlotId, getQuartzLineType, type QuartzLineType } from './quartz-rules.ts';
import {
  ELEMENTS,
  emptyElements,
  type Art,
  type Build,
  type ElementKey,
  type ElementValues,
  type Quartz,
  type SolveRequest,
  type SolveResult,
} from './domain.ts';

type Candidate = Quartz | null;

function requiredQuartzLevel(quartz: Quartz) {
  return quartz.quartzLevel ?? 1;
}

function equipNameKey(quartz: Quartz) {
  return quartz.name.trim().normalize('NFKC').toLocaleLowerCase('zh-CN') || quartz.id;
}

function satisfies(total: ElementValues, requirement: ElementValues) {
  return ELEMENTS.every((element) => total[element] >= requirement[element]);
}

function addElements(target: ElementValues, values: ElementValues) {
  for (const element of ELEMENTS) target[element] += values[element];
}

function availableCount(request: SolveRequest, quartzId: string, teammateCounts: Record<string, number>) {
  const resource = request.resources[quartzId];
  if (!resource) return 0;
  if (request.resourceMode === 'available_only') return Math.max(0, resource.ownedCount - (teammateCounts[quartzId] ?? 0));
  if (request.resourceMode === 'owned_only') return Math.max(0, resource.ownedCount);
  if (!resource.shopAvailable) return Math.max(0, resource.ownedCount);
  const purchasable = resource.shopPurchaseLimit == null ? request.character.slots.length : Math.max(0, resource.shopPurchaseLimit);
  return Math.max(0, resource.ownedCount) + purchasable;
}

function totalsFor(request: SolveRequest, assignments: Record<number, string | null>, quartzById: Map<string, Quartz>) {
  const totals: Record<string, ElementValues> = {};
  for (const line of request.character.lines) {
    const value = emptyElements();
    for (const slotId of line.slots) {
      const quartzId = assignments[slotId];
      if (quartzId) addElements(value, quartzById.get(quartzId)!.elements);
    }
    totals[line.id] = value;
  }
  return totals;
}

function buildFromAssignment(request: SolveRequest, assignments: Record<number, string | null>, quartzById: Map<string, Quartz>, artById: Map<string, Art>): Build | null {
  const lineTotals = totalsFor(request, assignments, quartzById);
  const artWitness: Record<string, string> = {};
  const unlockedArts: string[] = [];
  for (const art of request.arts) {
    const witness = request.character.lines.find((line) => satisfies(lineTotals[line.id], art.requirements));
    if (witness) {
      unlockedArts.push(art.id);
      artWitness[art.id] = witness.id;
    }
  }
  if (request.mustHaveArts.some((id) => !artWitness[id] || !artById.has(id))) return null;

  const usage: Record<string, number> = {};
  const slotFinalLevels: Record<number, number> = {};
  let upgradeSteps = 0;
  let upgradedSlotCount = 0;
  let ats = 0;
  let spd = 0;
  const equippedNames = new Set<string>();
  for (const slot of request.character.slots) {
    const quartzId = assignments[slot.id];
    const quartz = quartzId ? quartzById.get(quartzId)! : null;
    const policy = request.slotPolicies[slot.id];
    const finalLevel = quartz ? Math.max(policy.currentLevel, requiredQuartzLevel(quartz)) : policy.currentLevel;
    slotFinalLevels[slot.id] = finalLevel;
    if (finalLevel > policy.currentLevel) {
      upgradedSlotCount += 1;
      upgradeSteps += finalLevel - policy.currentLevel;
    }
    if (quartz) {
      const nameKey = equipNameKey(quartz);
      if (equippedNames.has(nameKey)) return null;
      equippedNames.add(nameKey);
      usage[quartz.id] = (usage[quartz.id] ?? 0) + 1;
      ats += quartz.stats.ats ?? 0;
      spd += quartz.stats.spd ?? 0;
    }
  }

  const purchases: Record<string, number> = {};
  let purchasedCount = 0;
  let purchaseCost = 0;
  for (const [quartzId, count] of Object.entries(usage)) {
    const resource = request.resources[quartzId];
    const purchase = Math.max(0, count - (resource?.ownedCount ?? 0));
    if (purchase > 0) {
      purchases[quartzId] = purchase;
      purchasedCount += purchase;
      purchaseCost += purchase * (resource?.shopPrice ?? 0);
    }
  }

  return {
    assignments: { ...assignments }, slotFinalLevels, purchases, lineTotals, artWitness, unlockedArts,
    metrics: {
      upgradeSteps, upgradedSlotCount, purchasedCount, purchaseCost,
      extraArtsCount: unlockedArts.filter((id) => !request.mustHaveArts.includes(id)).length,
      ats, spd,
    },
  };
}

function rankVector(build: Build, request: SolveRequest) {
  const m = build.metrics;
  switch (request.rankingPreset) {
    case 'upgrades': return [m.upgradeSteps, m.upgradedSlotCount, m.purchasedCount, m.purchaseCost, -m.extraArtsCount, -m.ats, -m.spd];
    case 'purchases': return [m.purchasedCount, m.purchaseCost, m.upgradeSteps, m.upgradedSlotCount, -m.extraArtsCount, -m.ats, -m.spd];
    case 'extra_arts': return [-m.extraArtsCount, m.upgradeSteps, m.purchasedCount, m.purchaseCost, -m.ats, -m.spd];
    default: return [m.upgradeSteps, m.purchasedCount, m.purchaseCost, -m.extraArtsCount, -m.ats, -m.spd];
  }
}

function compareBuilds(a: Build, b: Build, request: SolveRequest) {
  const av = rankVector(a, request);
  const bv = rankVector(b, request);
  for (let index = 0; index < av.length; index += 1) if (av[index] !== bv[index]) return av[index] - bv[index];
  const aKey = request.character.slots.map((slot) => a.assignments[slot.id] ?? '').join('|');
  const bKey = request.character.slots.map((slot) => b.assignments[slot.id] ?? '').join('|');
  return aKey.localeCompare(bKey);
}

export function solveOrbment(request: SolveRequest): SolveResult {
  if (!request.mustHaveArts.length) return { status: 'invalid_request', builds: [], nodesVisited: 0, truncated: false, message: '请至少选择一个必须魔法。' };
  const quartzById = new Map(request.quartz.map((quartz) => [quartz.id, quartz]));
  const artById = new Map(request.arts.map((art) => [art.id, art]));
  if (request.mustHaveArts.some((id) => !artById.has(id))) return { status: 'invalid_request', builds: [], nodesVisited: 0, truncated: false, message: '请求中包含不存在的魔法。' };
  const centralSlotId = getCentralSlotId(request.character);
  if (centralSlotId !== null && !request.character.slots.some((slot) => slot.id === centralSlotId)) {
    return { status: 'invalid_request', builds: [], nodesVisited: 0, truncated: false, message: '中央插槽引用了不存在的物理槽位，请检查角色导力器设置。' };
  }

  const goalArts = request.mustHaveArts.map((id) => artById.get(id)!);
  const teammateCounts = getEquippedCounts(request.equipment, request.character.id);
  const goalWeight = Object.fromEntries(ELEMENTS.map((element) => [element, Math.max(...goalArts.map((art) => art.requirements[element]), 0)])) as Record<ElementKey, number>;
  const candidates: Record<number, Candidate[]> = {};
  for (const slot of request.character.slots) {
    const policy = request.slotPolicies[slot.id];
    const allowedLevel = policy.allowUpgrade ? policy.maxLevel : policy.currentLevel;
    const list = request.quartz.filter((quartz) => {
      if (availableCount(request, quartz.id, teammateCounts) <= 0 || requiredQuartzLevel(quartz) > allowedLevel) return false;
      if (slot.restriction && getQuartzSeries(quartz) !== slot.restriction) return false;
      return true;
    });
    list.sort((a, b) => {
      const aScore = ELEMENTS.reduce((sum, element) => sum + Math.min(goalWeight[element], a.elements[element]) * (goalWeight[element] ? 1 : .05), 0);
      const bScore = ELEMENTS.reduce((sum, element) => sum + Math.min(goalWeight[element], b.elements[element]) * (goalWeight[element] ? 1 : .05), 0);
      const aUpgrade = Math.max(0, requiredQuartzLevel(a) - policy.currentLevel);
      const bUpgrade = Math.max(0, requiredQuartzLevel(b) - policy.currentLevel);
      return bScore - aScore || aUpgrade - bUpgrade || a.name.localeCompare(b.name);
    });
    candidates[slot.id] = [...list, null];
  }

  const lineMembership = Object.fromEntries(request.character.slots.map((slot) => [slot.id, request.character.lines.filter((line) => line.slots.includes(slot.id)).length]));
  const slotOrder = [...request.character.slots].sort((a, b) => candidates[a.id].length - candidates[b.id].length || lineMembership[b.id] - lineMembership[a.id] || a.id - b.id);
  const maxContribution: Record<number, ElementValues> = {};
  for (const slot of request.character.slots) {
    const values = emptyElements();
    for (const candidate of candidates[slot.id]) if (candidate) for (const element of ELEMENTS) values[element] = Math.max(values[element], candidate.elements[element]);
    maxContribution[slot.id] = values;
  }

  const assignments: Record<number, string | null> = Object.fromEntries(request.character.slots.map((slot) => [slot.id, null]));
  const assigned = new Set<number>();
  const usage: Record<string, number> = {};
  const usedNames = new Set<string>();
  const usedFamilies = new Set<string>();
  const quartzLineTypes = new Map(request.quartz.map((quartz) => [quartz.id, getQuartzLineType(quartz)]));
  const lineTypes = request.character.lines.map(() => new Set<QuartzLineType>());
  const centralTypes = new Set<QuartzLineType>();
  // The center has a separate quota; other shared slots consume every containing line's quota.
  const slotTypeScopes = new Map(request.character.slots.map((slot) => [slot.id, slot.id === centralSlotId
    ? [centralTypes]
    : request.character.lines.flatMap((line, index) => line.slots.includes(slot.id) ? [lineTypes[index]] : [])]));
  const builds: Build[] = [];
  const signatures = new Set<string>();
  const maxNodes = request.maxNodes ?? 250_000;
  let nodesVisited = 0;
  let truncated = false;

  const canStillSatisfy = () => {
    const currentTotals = totalsFor(request, assignments, quartzById);
    return goalArts.every((art) => request.character.lines.some((line) => {
      const optimistic = { ...currentTotals[line.id] };
      for (const slotId of line.slots) if (!assigned.has(slotId)) addElements(optimistic, maxContribution[slotId]);
      return satisfies(optimistic, art.requirements);
    }));
  };

  const insertBuild = (build: Build) => {
    const signature = request.character.slots.map((slot) => build.assignments[slot.id] ?? '').join('|');
    if (signatures.has(signature)) return;
    signatures.add(signature);
    builds.push(build);
    builds.sort((a, b) => compareBuilds(a, b, request));
    if (builds.length > request.maxResults) {
      const removed = builds.pop()!;
      signatures.delete(request.character.slots.map((slot) => removed.assignments[slot.id] ?? '').join('|'));
    }
  };

  const search = (depth: number) => {
    if (nodesVisited >= maxNodes) { truncated = true; return; }
    nodesVisited += 1;
    if (!canStillSatisfy()) return;
    if (depth === slotOrder.length) {
      const build = buildFromAssignment(request, assignments, quartzById, artById);
      if (build) insertBuild(build);
      return;
    }
    const slot = slotOrder[depth];
    const policy = request.slotPolicies[slot.id];
    for (const candidate of candidates[slot.id]) {
      if (nodesVisited >= maxNodes) { truncated = true; break; }
      const lineType = candidate ? quartzLineTypes.get(candidate.id)! : null;
      const typeScopes = slotTypeScopes.get(slot.id)!;
      if (candidate) {
        const nameKey = equipNameKey(candidate);
        if (usedNames.has(nameKey)) continue;
        if ((usage[candidate.id] ?? 0) >= availableCount(request, candidate.id, teammateCounts)) continue;
        if (candidate.uniqueEquip && (usage[candidate.id] ?? 0) > 0) continue;
        if (candidate.family && usedFamilies.has(candidate.family)) continue;
        if (lineType && typeScopes.some((scope) => scope.has(lineType))) continue;
        const requiredLevel = requiredQuartzLevel(candidate);
        if (requiredLevel > policy.currentLevel && (!policy.allowUpgrade || requiredLevel > policy.maxLevel)) continue;
        assignments[slot.id] = candidate.id;
        usage[candidate.id] = (usage[candidate.id] ?? 0) + 1;
        usedNames.add(nameKey);
        if (candidate.family) usedFamilies.add(candidate.family);
        if (lineType) for (const scope of typeScopes) scope.add(lineType);
      } else assignments[slot.id] = null;
      assigned.add(slot.id);
      search(depth + 1);
      assigned.delete(slot.id);
      if (candidate) {
        usage[candidate.id] -= 1;
        if (usage[candidate.id] === 0) delete usage[candidate.id];
        usedNames.delete(equipNameKey(candidate));
        if (candidate.family) usedFamilies.delete(candidate.family);
        if (lineType) for (const scope of typeScopes) scope.delete(lineType);
      }
      assignments[slot.id] = null;
    }
  };

  search(0);
  if (!builds.length) return { status: 'no_solution', builds, nodesVisited, truncated, message: truncated ? '在本次搜索上限内未找到合法方案。可尝试减少目标或允许更多升级与购买。' : '未找到满足全部必须魔法的合法配置。请检查库存、商店与槽位升级策略。' };
  return { status: 'solved', builds, nodesVisited, truncated, message: truncated ? `找到 ${builds.length} 个已搜索范围内的最佳候选方案（已达到搜索上限）。` : `找到 ${builds.length} 个最优候选方案。` };
}
