import { ELEMENTS, type ElementKey, type Quartz } from './domain.ts';

export type QuartzGroupId = ElementKey | 'none';
export const QUARTZ_GROUPS: QuartzGroupId[] = [...ELEMENTS, 'none'];

// Match the order of the element values shown in the inventory.
export function getQuartzGroup(quartz: Pick<Quartz, 'elements'>): QuartzGroupId {
  return ELEMENTS.find((element) => quartz.elements[element] > 0) ?? 'none';
}

export function groupQuartzForInventory(quartz: Quartz[]) {
  const groups = QUARTZ_GROUPS.map((id) => ({ id, quartz: [] as Quartz[] }));
  for (const item of quartz) {
    groups.find((group) => group.id === getQuartzGroup(item))!.quartz.push(item);
  }
  return groups.filter((group) => group.quartz.length > 0);
}
