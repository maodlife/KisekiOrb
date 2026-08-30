import { ELEMENTS, emptyElements, type Art, type Character, type ElementKey, type GameData, type PlayerState, type Quartz } from './domain.ts';

function elements(values: Partial<Record<ElementKey, number>>) {
  return { ...emptyElements(), ...values };
}

const quartz = (id: string, name: string, family: string | null, quartzLevel: number, values: Partial<Record<ElementKey, number>>, stats: Record<string, number> = {}, uniqueEquip = false): Quartz => {
  const elementValues = elements(values);
  const series = ELEMENTS.reduce((best, element) => elementValues[element] > elementValues[best] ? element : best, ELEMENTS[0]);
  return { id, name, series, family, quartzLevel, elements: elementValues, stats, tags: [], uniqueEquip };
};

const art = (id: string, name: string, requirements: Partial<Record<ElementKey, number>>, category: string, epCost: number): Art => ({
  id, name, requirements: elements(requirements), category, epCost,
});

const estelle: Character = {
  id: 'estelle', name: '艾丝蒂尔',
  slots: [
    { id: 0, x: 50, y: 50, currentLevel: 2, maxGameLevel: 3, restriction: null },
    { id: 1, x: 50, y: 10, currentLevel: 1, maxGameLevel: 3, restriction: null },
    { id: 2, x: 14, y: 32, currentLevel: 2, maxGameLevel: 3, restriction: 'earth' },
    { id: 3, x: 86, y: 32, currentLevel: 1, maxGameLevel: 3, restriction: null },
    { id: 4, x: 50, y: 88, currentLevel: 2, maxGameLevel: 3, restriction: null },
    { id: 5, x: 18, y: 76, currentLevel: 1, maxGameLevel: 3, restriction: null },
    { id: 6, x: 82, y: 76, currentLevel: 1, maxGameLevel: 3, restriction: null },
  ],
  lines: [
    { id: 'L1', name: 'Line 1', slots: [0, 1, 2] },
    { id: 'L2', name: 'Line 2', slots: [0, 3] },
    { id: 'L3', name: 'Line 3', slots: [0, 4, 5] },
    { id: 'L4', name: 'Line 4', slots: [0, 4, 6] },
  ],
};

const joshua: Character = {
  id: 'joshua', name: '约修亚',
  slots: [
    { id: 0, x: 50, y: 50, currentLevel: 2, maxGameLevel: 3, restriction: 'time' },
    { id: 1, x: 50, y: 9, currentLevel: 2, maxGameLevel: 3, restriction: null },
    { id: 2, x: 18, y: 27, currentLevel: 1, maxGameLevel: 3, restriction: null },
    { id: 3, x: 82, y: 27, currentLevel: 1, maxGameLevel: 3, restriction: null },
    { id: 4, x: 50, y: 91, currentLevel: 2, maxGameLevel: 3, restriction: null },
    { id: 5, x: 18, y: 73, currentLevel: 1, maxGameLevel: 3, restriction: null },
    { id: 6, x: 82, y: 73, currentLevel: 1, maxGameLevel: 3, restriction: null },
  ],
  lines: [
    { id: 'L1', name: 'Line 1', slots: [0, 1, 2, 5] },
    { id: 'L2', name: 'Line 2', slots: [0, 3, 6] },
    { id: 'L3', name: 'Line 3', slots: [0, 4] },
  ],
};

export const DEFAULT_GAME_DATA: GameData = {
  version: 'sample-0.2',
  characters: [estelle, joshua],
  quartz: [
    quartz('defense_1', '防御1', 'defense', 1, { earth: 3 }),
    quartz('defense_2', '防御2', 'defense', 2, { earth: 5 }),
    quartz('mind_1', '精神1', 'mind', 1, { water: 2, mirage: 1 }, { ats: 3 }),
    quartz('mind_2', '精神2', 'mind', 2, { water: 4, mirage: 2 }, { ats: 6 }),
    quartz('action_1', '行动力1', 'action', 1, { wind: 2, time: 1 }, { spd: 2 }),
    quartz('action_2', '行动力2', 'action', 2, { wind: 4, time: 2 }, { spd: 4 }),
    quartz('cast_1', '驱动1', 'cast', 1, { time: 2, space: 1 }),
    quartz('cast_2', '驱动2', 'cast', 2, { time: 4, space: 2 }),
    quartz('ep_1', '省EP1', 'ep_cut', 1, { space: 2, mirage: 1 }),
    quartz('ep_2', '省EP2', 'ep_cut', 2, { space: 4, mirage: 2 }),
    quartz('attack_1', '攻击1', 'attack', 1, { fire: 3 }),
    quartz('attack_2', '攻击2', 'attack', 2, { fire: 5 }),
    quartz('heal', '治愈', null, 1, { water: 2, wind: 2, time: 2, space: 1 }),
    quartz('fortune', '幸运', null, 2, { mirage: 3, space: 1 }, {}, true),
  ],
  arts: [
    art('tear', '回复术', { water: 2 }, '回复', 10),
    art('tearal', '中回复术', { water: 4 }, '回复', 20),
    art('la_tearial', '回复术 · 复', { water: 6, wind: 2, space: 2 }, '回复', 40),
    art('fire_bolt', '火之矢', { fire: 3 }, '攻击', 10),
    art('aerial', '风之领域', { wind: 4 }, '攻击', 25),
    art('clock_up', '时间加速', { time: 4 }, '辅助', 20),
    art('earth_guard', '大地之障', { earth: 4 }, '辅助', 20),
    art('soul_blur', '灵魂模糊', { time: 4, mirage: 2 }, '攻击', 30),
    art('silver_thorn', '银色荆棘', { space: 4, mirage: 4 }, '攻击', 45),
    art('zodiac', '星杯领域', { water: 3, wind: 2, space: 3, mirage: 5 }, '辅助', 60),
  ],
};

export function createDefaultPlayerState(gameData: GameData = DEFAULT_GAME_DATA): PlayerState {
  const defaults: Record<string, { owned: number; shop: boolean; price: number | null }> = {
    defense_1: { owned: 1, shop: true, price: 500 }, defense_2: { owned: 0, shop: true, price: 1100 },
    mind_1: { owned: 1, shop: true, price: 600 }, mind_2: { owned: 1, shop: true, price: 1300 },
    action_1: { owned: 1, shop: true, price: 700 }, action_2: { owned: 0, shop: true, price: 1500 },
    cast_1: { owned: 1, shop: true, price: 600 }, cast_2: { owned: 1, shop: true, price: 1400 },
    ep_1: { owned: 1, shop: true, price: 650 }, ep_2: { owned: 0, shop: true, price: 1450 },
    attack_1: { owned: 1, shop: true, price: 550 }, attack_2: { owned: 0, shop: true, price: 1200 },
    heal: { owned: 1, shop: false, price: null }, fortune: { owned: 1, shop: false, price: null },
  };
  return {
    version: 'player-0.1',
    resources: Object.fromEntries(gameData.quartz.map((q) => {
      const item = defaults[q.id] ?? { owned: 0, shop: false, price: null };
      return [q.id, { quartzId: q.id, ownedCount: item.owned, shopAvailable: item.shop, shopPrice: item.price, shopPurchaseLimit: null }];
    })),
    slotLevels: Object.fromEntries(gameData.characters.map((character) => [character.id, Object.fromEntries(character.slots.map((slot) => [String(slot.id), slot.currentLevel]))])),
    lastSolver: { characterId: gameData.characters[0]?.id ?? '', resourceMode: 'owned_plus_shop', mustHaveArts: ['la_tearial', 'clock_up'], rankingPreset: 'resource' },
  };
}
