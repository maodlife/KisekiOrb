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
  equipment: Record<string, Record<number, string | null>>;
  lastSolver: {
    characterId: string;
    resourceMode: ResourceMode;
    mustHaveArts: string[];
    rankingPreset: RankingPreset;
    timeoutSeconds?: number;
  };
};

export type ResourceMode = 'available_only' | 'owned_only' | 'owned_plus_shop';
export type RankingPreset = 'resource' | 'upgrades' | 'purchases' | 'extra_arts';
export type SlotPolicy = { currentLevel: number; allowUpgrade: boolean; maxLevel: number };

export type SolveRequest = {
  character: Character;
  quartz: Quartz[];
  arts: Art[];
  resources: Record<string, QuartzResource>;
  equipment?: PlayerState['equipment'];
  resourceMode: ResourceMode;
  slotPolicies: Record<number, SlotPolicy>;
  mustHaveArts: string[];
  rankingPreset: RankingPreset;
  maxResults: number;
  timeoutMs?: number;
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

export type SolveStopReason = 'searching' | 'no_better' | 'no_solution' | 'time_limit' | 'cancelled' | 'solver_unknown' | 'invalid_request';
export type SolverModelInfo = { physicalSlots: number; equivalentSlotGroups: number; equipmentVariables: number };
export type SolveResult = {
  status: 'solved' | 'no_solution' | 'invalid_request' | 'unknown' | 'cancelled';
  builds: Build[];
  attempts: number;
  elapsedMs: number;
  budgetMs: number;
  stopReason: SolveStopReason;
  extraArtsOptimal: boolean;
  message: string;
  model?: SolverModelInfo;
  improvements: { elapsedMs: number; extraArtsCount: number }[];
};
export type SolveProgress = {
  phase: 'initializing' | 'searching';
  message: string;
  elapsedMs: number;
  budgetMs: number;
  attempts: number;
  target: number;
  bestExtraArtsCount: number | null;
};
export type SolverWorkerInput = { kind: 'solve'; generation: number; request: SolveRequest } | { kind: 'cancel' };
export type SolverWorkerOutput =
  | { type: 'progress'; generation: number; progress: SolveProgress }
  | { type: 'candidate' | 'complete'; generation: number; result: SolveResult }
  | { type: 'error'; generation: number; message: string };

export function emptyElements(): ElementValues {
  return { earth: 0, water: 0, fire: 0, wind: 0, time: 0, space: 0, mirage: 0 };
}
