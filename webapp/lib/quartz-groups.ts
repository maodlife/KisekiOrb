import { ELEMENTS, type ElementKey, type Quartz } from './domain.ts';
import { getQuartzSeries } from './quartz-series.ts';

export type QuartzGroupId = ElementKey | 'none';
export const QUARTZ_GROUPS: QuartzGroupId[] = [...ELEMENTS, 'none'];

// A quartz's series is independent of the order or magnitude of its element values.
export function getQuartzGroup(quartz: Pick<Quartz, 'series' | 'elements'>): QuartzGroupId {
  if (quartz.series && ELEMENTS.includes(quartz.series)) return quartz.series;
  return ELEMENTS.some((element) => quartz.elements[element] > 0) ? getQuartzSeries(quartz) : 'none';
}

export function groupQuartzForInventory(quartz: Quartz[]) {
  const groups = QUARTZ_GROUPS.map((id) => ({ id, quartz: [] as Quartz[] }));
  for (const item of quartz) {
    groups.find((group) => group.id === getQuartzGroup(item))!.quartz.push(item);
  }
  return groups.filter((group) => group.quartz.length > 0);
}
