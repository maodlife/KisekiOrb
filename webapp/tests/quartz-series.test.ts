import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyElements, type Quartz } from '../lib/domain.ts';
import { compareQuartzBySeriesLevelName, getQuartzSeries } from '../lib/quartz-series.ts';

const quartz = (id: string, name: string, level: number, series?: Quartz['series'], earth = 0): Quartz => ({
  id, name, series, family: null, quartzLevel: level,
  elements: { ...emptyElements(), earth }, stats: {}, tags: [], uniqueEquip: false,
});

test('infers a series for legacy quartz without a stored series', () => {
  const item = quartz('legacy', '旧回路', 1, undefined, 3);
  assert.equal(getQuartzSeries(item), 'earth');
});

test('sorts quartz by series, then level, then name', () => {
  const items = [
    quartz('water', '水回路', 1, 'water'),
    quartz('earth-b', '乙', 2, 'earth'),
    quartz('earth-a', '甲', 2, 'earth'),
    quartz('earth-low', '低等级', 1, 'earth'),
  ];

  assert.deepEqual(items.sort(compareQuartzBySeriesLevelName).map((item) => item.id), ['earth-low', 'earth-a', 'earth-b', 'water']);
});
