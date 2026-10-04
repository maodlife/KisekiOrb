import { ELEMENTS, type ElementKey, type Quartz } from './domain.ts';

const nameCollator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

export function getQuartzSeries(quartz: Pick<Quartz, 'series' | 'elements'>): ElementKey {
  if (quartz.series && ELEMENTS.includes(quartz.series)) return quartz.series;
  return ELEMENTS.reduce((best, element) => quartz.elements[element] > quartz.elements[best] ? element : best, ELEMENTS[0]);
}

export function getQuartzDisplayElements(quartz: Pick<Quartz, 'series' | 'elements'>): ElementKey[] {
  const series = getQuartzSeries(quartz);
  return [series, ...ELEMENTS.filter((element) => element !== series)].filter((element) => quartz.elements[element] > 0);
}

export function compareQuartzBySeriesLevelName(a: Quartz, b: Quartz): number {
  const seriesDifference = ELEMENTS.indexOf(getQuartzSeries(a)) - ELEMENTS.indexOf(getQuartzSeries(b));
  if (seriesDifference !== 0) return seriesDifference;
  const levelDifference = (a.quartzLevel ?? Number.MAX_SAFE_INTEGER) - (b.quartzLevel ?? Number.MAX_SAFE_INTEGER);
  return levelDifference !== 0 ? levelDifference : nameCollator.compare(a.name, b.name);
}
