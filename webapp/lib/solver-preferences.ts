import type { Character, CharacterSolverPreferences, GameData, PlayerState } from './domain.ts';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const integer = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
const selectedIds = (value: unknown, available: readonly { id: string }[], fallback: string[]): string[] =>
  [...new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : fallback)]
    .filter(id => available.some(item => item.id === id));

export function normalizeCharacterSolverPreferences(
  gameData: GameData, player: Pick<PlayerState, 'slotLevels'>, character: Character, value: unknown,
): CharacterSolverPreferences {
  const saved = record(value);
  const defaults = ['art-water-06', 'art-time-07'].every(id => gameData.arts.some(art => art.id === id))
    ? ['art-water-06', 'art-time-07'] : [];
  const slotPolicies = record(saved.slotPolicies);
  return {
    resourceMode: saved.resourceMode === 'available_only' || saved.resourceMode === 'owned_plus_shop' ? saved.resourceMode : 'owned_only',
    mustHaveArts: selectedIds(saved.mustHaveArts, gameData.arts, defaults),
    mustHaveQuartz: selectedIds(saved.mustHaveQuartz, gameData.quartz, []),
    timeoutSeconds: typeof saved.timeoutSeconds === 'number' && Number.isInteger(saved.timeoutSeconds)
      && saved.timeoutSeconds >= 1 && saved.timeoutSeconds <= 120 ? saved.timeoutSeconds : 10,
    slotPolicies: Object.fromEntries(character.slots.map(slot => {
      const ceiling = Math.max(1, slot.maxGameLevel);
      const currentLevel = integer(player.slotLevels[character.id]?.[String(slot.id)], integer(slot.currentLevel, 1, 0, ceiling), 0, ceiling);
      const policy = record(slotPolicies[String(slot.id)]);
      const allowUpgrade = policy.allowUpgrade === true;
      const maxLevel = allowUpgrade ? integer(policy.maxLevel, currentLevel, currentLevel, ceiling) : currentLevel;
      return [slot.id, { currentLevel, allowUpgrade, maxLevel }];
    })),
  };
}

export function getCharacterSolverPreferences(gameData: GameData, player: PlayerState, characterId: string): CharacterSolverPreferences {
  const character = gameData.characters.find(item => item.id === characterId) ?? gameData.characters[0];
  if (!character) throw new Error('No character is available.');
  const map = record(player.solverByCharacter);
  const saved = Object.hasOwn(map, character.id) ? map[character.id]
    : player.lastSolver.characterId === character.id ? player.lastSolver : undefined;
  return normalizeCharacterSolverPreferences(gameData, player, character, saved);
}

export function updateCharacterSolverPreferences(
  gameData: GameData, player: PlayerState, characterId: string, patch: Partial<CharacterSolverPreferences>,
): PlayerState {
  const character = gameData.characters.find(item => item.id === characterId);
  if (!character) return player;
  const preferences = normalizeCharacterSolverPreferences(gameData, player, character,
    { ...getCharacterSolverPreferences(gameData, player, characterId), ...patch });
  // Snapshot the previous legacy selection before moving lastSolver to another character.
  const previous = gameData.characters.find(item => item.id === player.lastSolver.characterId);
  const map = { ...player.solverByCharacter };
  if (previous && !Object.hasOwn(map, previous.id)) map[previous.id] = getCharacterSolverPreferences(gameData, player, previous.id);
  map[characterId] = preferences;
  return { ...player, solverByCharacter: map, lastSolver: {
    characterId, resourceMode: preferences.resourceMode, mustHaveArts: [...preferences.mustHaveArts],
    mustHaveQuartz: [...preferences.mustHaveQuartz], timeoutSeconds: preferences.timeoutSeconds, rankingPreset: 'extra_arts',
  } };
}

export function normalizeSolverPreferencesByCharacter(gameData: GameData, player: PlayerState): NonNullable<PlayerState['solverByCharacter']> {
  const map = record(player.solverByCharacter);
  const entries = gameData.characters.filter(character => Object.hasOwn(map, character.id))
    .map(character => [character.id, normalizeCharacterSolverPreferences(gameData, player, character, map[character.id])] as const);
  // Old backups have one selection, belonging only to their last active character.
  if (player.solverByCharacter === undefined) {
    const legacy = gameData.characters.find(character => character.id === player.lastSolver.characterId);
    if (legacy) entries.push([legacy.id, normalizeCharacterSolverPreferences(gameData, player, legacy, player.lastSolver)]);
  }
  return Object.fromEntries(entries);
}
