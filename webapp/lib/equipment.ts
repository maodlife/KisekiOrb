import type { Build, Character, GameData, PlayerState, Quartz, QuartzResource } from './domain.ts';
import { getCentralSlotId, getQuartzLevelFamily, getQuartzLineType, type QuartzLineType } from './quartz-rules.ts';
import { getQuartzSeries } from './quartz-series.ts';

export function getEquippedCounts(equipment: PlayerState['equipment'] = {}, excludeCharacterId?: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [characterId, slots] of Object.entries(equipment)) {
    if (characterId === excludeCharacterId) continue;
    for (const quartzId of Object.values(slots)) if (quartzId) counts[quartzId] = (counts[quartzId] ?? 0) + 1;
  }
  return counts;
}

export function getAvailableQuartzCount(resources: Record<string, QuartzResource>, equipment: PlayerState['equipment'] = {}, quartzId: string, excludeCharacterId?: string): number {
  return Math.max(0, (resources[quartzId]?.ownedCount ?? 0) - (getEquippedCounts(equipment, excludeCharacterId)[quartzId] ?? 0));
}

export function normalizeEquipment(gameData: GameData, resources: Record<string, QuartzResource>, equipment: PlayerState['equipment'] = {}): PlayerState['equipment'] {
  const quartzIds = new Set(gameData.quartz.map((quartz) => quartz.id));
  const remaining = Object.fromEntries(Object.entries(resources).map(([id, resource]) => [id, resource.ownedCount]));
  return Object.fromEntries(gameData.characters.map((character) => [character.id, Object.fromEntries(character.slots.map((slot) => {
    const quartzId = equipment[character.id]?.[slot.id];
    if (typeof quartzId !== 'string' || !quartzIds.has(quartzId) || !(remaining[quartzId] > 0)) return [slot.id, null];
    remaining[quartzId] -= 1;
    return [slot.id, quartzId];
  }))]));
}

export function unequipQuartz(player: PlayerState, characterId: string, slotId?: number): PlayerState {
  const slots = player.equipment[characterId] ?? {};
  const equipment = slotId === undefined
    ? Object.fromEntries(Object.keys(slots).map((id) => [id, null]))
    : { ...slots, [slotId]: null };
  return { ...player, equipment: { ...player.equipment, [characterId]: equipment } };
}

export function removeQuartzFromEquipment(player: PlayerState, quartzId: string): PlayerState {
  return { ...player, equipment: Object.fromEntries(Object.entries(player.equipment).map(([characterId, slots]) => [
    characterId, Object.fromEntries(Object.entries(slots).map(([slotId, id]) => [slotId, id === quartzId ? null : id])),
  ])) };
}

export type EquipBuildResult =
  | { ok: true; player: PlayerState }
  | { ok: false; message: string };

// Return an atomic replacement: release this character's previous loadout, keep teammates,
// and check actual stock instead of counting unexecuted purchases as owned quartz.
export function equipBuild(player: PlayerState, character: Character, quartz: Quartz[], build: Build): EquipBuildResult {
  const quartzById = new Map(quartz.map((item) => [item.id, item]));
  const assignments: Record<number, string | null> = {};
  const usage: Record<string, number> = {};
  const names = new Set<string>();
  const families = new Set<string>();
  const levelFamilies = new Set<string>();
  const lineTypes = character.lines.map(() => new Set<QuartzLineType>());
  const centralSlotId = getCentralSlotId(character);
  const levels = { ...player.slotLevels[character.id] };
  const fail = (message: string): EquipBuildResult => ({ ok: false, message });
  for (const slot of character.slots) {
    const quartzId = build.assignments[slot.id] ?? null;
    assignments[slot.id] = quartzId;
    const level = build.slotFinalLevels[slot.id];
    const currentLevel = levels[String(slot.id)] ?? slot.currentLevel;
    if (!Number.isInteger(level) || level < currentLevel || level > slot.maxGameLevel) return fail('方案的槽位等级已不适用，请重新求解。');
    levels[String(slot.id)] = level;
    if (!quartzId) continue;
    const item = quartzById.get(quartzId);
    if (!item || !player.resources[quartzId]) return fail('方案中存在已删除的回路，请重新求解。');
    if ((item.quartzLevel ?? 1) > level || (slot.restriction && getQuartzSeries(item) !== slot.restriction)) return fail('方案不符合当前槽位限制，请重新求解。');
    const name = item.name.trim().normalize('NFKC').toLocaleLowerCase('zh-CN') || item.id;
    const levelFamily = getQuartzLevelFamily(item);
    if (names.has(name) || (item.family && families.has(item.family)) || (levelFamily && levelFamilies.has(levelFamily))) return fail('方案中的回路存在重复或互斥，请重新求解。');
    names.add(name);
    if (item.family) families.add(item.family);
    if (levelFamily) levelFamilies.add(levelFamily);
    const type = getQuartzLineType(item);
    if (type && slot.id !== centralSlotId) {
      for (let index = 0; index < character.lines.length; index += 1) {
        if (!character.lines[index].slots.includes(slot.id)) continue;
        if (lineTypes[index].has(type)) return fail('方案超过刃、盾、理系的线路装备限制，请重新求解。');
        lineTypes[index].add(type);
      }
    }
    usage[quartzId] = (usage[quartzId] ?? 0) + 1;
  }

  const teammateCounts = getEquippedCounts(player.equipment, character.id);
  for (const [quartzId, count] of Object.entries(usage)) {
    const resource = player.resources[quartzId];
    const available = Math.max(0, resource.ownedCount - (teammateCounts[quartzId] ?? 0));
    if (count > available) return fail(`「${quartzById.get(quartzId)!.name}」可用数量不足（需要 ${count}，可用 ${available}）。请先补充库存或让队友脱下，再重新求解。`);
  }
  return {
    ok: true,
    player: { ...player, equipment: { ...player.equipment, [character.id]: assignments }, slotLevels: { ...player.slotLevels, [character.id]: levels } },
  };
}
