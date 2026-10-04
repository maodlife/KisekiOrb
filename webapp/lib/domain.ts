export const ELEMENTS = ['earth', 'water', 'fire', 'wind', 'time', 'space', 'mirage'] as const;
export type ElementKey = (typeof ELEMENTS)[number];
export type ElementValues = Record<ElementKey, number>;

export const ELEMENT_LABELS: Record<ElementKey, string> = {
  earth: '地', water: '水', fire: '火', wind: '风', time: '时', space: '空', mirage: '幻',
};

export type Slot = {
  id: number;
  x: number;
  y: number;
  currentLevel: number;
  maxGameLevel: number;
  restriction: ElementKey | null;
  notes?: string;
};

export type Line = { id: string; name: string; slots: number[]; edges?: [number, number][] };
export type Character = { id: string; name: string; centralSlotId?: number | null; slots: Slot[]; lines: Line[] };

export type Quartz = {
  id: string;
  name: string;
  series?: ElementKey;
  family: string | null;
  quartzLevel: number | null;
  elements: ElementValues;
  stats: Record<string, number>;
  tags: string[];
  uniqueEquip: boolean | null;
  notes?: string;
};

export type Art = {
  id: string;
  name: string;
  series?: ElementKey;
  requirements: ElementValues;
  epCost: number;
  category: string;
  power?: string | null;
  range?: string;
  effects?: string[];
  notes?: string;
};

export type GameData = {
  version: string;
  characters: Character[];
  quartz: Quartz[];
  arts: Art[];
};

export type QuartzResource = {
  quartzId: string;
  ownedCount: number;
  shopAvailable: boolean;
  shopPrice: number | null;
  shopPurchaseLimit: number | null;
};

export type PlayerState = {
  version: string;
  resources: Record<string, QuartzResource>;
  slotLevels: Record<string, Record<string, number>>;
  lastSolver: {
    characterId: string;
    resourceMode: ResourceMode;
    mustHaveArts: string[];
    rankingPreset: RankingPreset;
  };
};

export type ResourceMode = 'owned_only' | 'owned_plus_shop';
export type RankingPreset = 'resource' | 'upgrades' | 'purchases' | 'extra_arts';
export type SlotPolicy = { currentLevel: number; allowUpgrade: boolean; maxLevel: number };

export type SolveRequest = {
  character: Character;
  quartz: Quartz[];
  arts: Art[];
  resources: Record<string, QuartzResource>;
  resourceMode: ResourceMode;
  slotPolicies: Record<number, SlotPolicy>;
  mustHaveArts: string[];
  rankingPreset: RankingPreset;
  maxResults: number;
  maxNodes?: number;
};

export type BuildMetrics = {
  upgradeSteps: number;
  upgradedSlotCount: number;
  purchasedCount: number;
  purchaseCost: number;
  extraArtsCount: number;
  ats: number;
  spd: number;
};

export type Build = {
  assignments: Record<number, string | null>;
  slotFinalLevels: Record<number, number>;
  purchases: Record<string, number>;
  lineTotals: Record<string, ElementValues>;
  artWitness: Record<string, string>;
  unlockedArts: string[];
  metrics: BuildMetrics;
};

export type SolveResult = {
  status: 'solved' | 'no_solution' | 'invalid_request';
  builds: Build[];
  nodesVisited: number;
  truncated: boolean;
  message: string;
};

export function emptyElements(): ElementValues {
  return { earth: 0, water: 0, fire: 0, wind: 0, time: 0, space: 0, mirage: 0 };
}
