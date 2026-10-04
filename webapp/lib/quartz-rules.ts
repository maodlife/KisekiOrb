import type { Character, Quartz } from './domain.ts';

export type QuartzLineType = 'blade' | 'shield' | 'reason';

const SUFFIX_TYPES: Record<string, QuartzLineType> = {
  刃: 'blade',
  盾: 'shield',
  理: 'reason',
};

// Infer from names so existing browser data and imported backups follow the rule too.
export function getQuartzLineType(quartz: Pick<Quartz, 'name'>): QuartzLineType | null {
  const suffix = quartz.name.trim().normalize('NFKC').match(/之([刃盾理])(?:\s*\d+)?$/u)?.[1];
  return suffix ? SUFFIX_TYPES[suffix] : null;
}

export function getCentralSlotId(character: Character): number | null {
  if (character.centralSlotId !== undefined) return character.centralSlotId;
  // Legacy screenshot data and generated templates placed the center at (50, 50).
  // Sharing alone does not make a physical slot the center.
  const centers = character.slots.filter((slot) => slot.x === 50 && slot.y === 50);
  return centers.length === 1 ? centers[0].id : null;
}
