import type { Character } from './domain.ts';

const SLOT_POSITIONS = [
  { x: 50, y: 50 },
  { x: 50, y: 9 },
  { x: 18, y: 28 },
  { x: 82, y: 28 },
  { x: 50, y: 91 },
  { x: 18, y: 72 },
  { x: 82, y: 72 },
] as const;

export type CharacterTemplateOptions = {
  id: string;
  name: string;
  lineCount: number;
  currentLevel: number;
  maxGameLevel: number;
};

export function createCharacterTemplate(options: CharacterTemplateOptions): Character {
  const lineCount = Math.max(1, Math.min(6, Math.floor(options.lineCount)));
  const maxGameLevel = Math.max(1, Math.min(3, Math.floor(options.maxGameLevel)));
  const currentLevel = Math.max(1, Math.min(maxGameLevel, Math.floor(options.currentLevel)));

  const slots = SLOT_POSITIONS.map((position, id) => ({
    id,
    ...position,
    currentLevel,
    maxGameLevel,
    restriction: null,
  }));

  const lines = Array.from({ length: lineCount }, (_, index) => ({
    id: `L${index + 1}`,
    name: `Line ${index + 1}`,
    slots: [0, ...slots.slice(1).filter((slot) => (slot.id - 1) % lineCount === index).map((slot) => slot.id)],
  }));

  return { id: options.id, name: options.name.trim(), slots, lines };
}
