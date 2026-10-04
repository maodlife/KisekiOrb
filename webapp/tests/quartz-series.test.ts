import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyElements, type Quartz } from '../lib/domain.ts';
import { compareQuartzBySeriesLevelName, getQuartzDisplayElements, getQuartzSeries } from '../lib/quartz-series.ts';
import { DEFAULT_GAME_DATA } from '../lib/default-data.ts';

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

test('inventory element order matches the water-series screenshot examples', () => {
  const compassion = DEFAULT_GAME_DATA.quartz.find((item) => item.name === '慈爱')!;
  const waterfall = DEFAULT_GAME_DATA.quartz.find((item) => item.name === '瀑布')!;
  assert.deepEqual(getQuartzDisplayElements(compassion), ['water', 'earth']);
  assert.deepEqual(getQuartzDisplayElements(waterfall), ['water', 'earth', 'fire', 'wind']);
  // JSON property order has no bearing on a quartz's series or display order.
  assert.deepEqual(getQuartzDisplayElements({ ...waterfall, elements: { mirage: 0, space: 0, time: 0, wind: 3, fire: 3, water: 3, earth: 3 } }), ['water', 'earth', 'fire', 'wind']);
});

test('displayed elements omit zero values and never duplicate the series', () => {
  for (const item of DEFAULT_GAME_DATA.quartz) {
    const displayed = getQuartzDisplayElements(item);
    assert.equal(displayed[0], item.series, item.name);
    assert.equal(new Set(displayed).size, displayed.length, item.name);
    assert.deepEqual([...displayed].sort(), Object.keys(item.elements).filter((element) => item.elements[element as keyof Quartz['elements']] > 0).sort(), item.name);
  }
  assert.deepEqual(getQuartzDisplayElements(quartz('empty', '空回路', 1, 'water')), []);
});
