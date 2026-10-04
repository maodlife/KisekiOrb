import { DEFAULT_GAME_DATA, createDefaultPlayerState } from './default-data.ts';
import type { GameData, PlayerState } from './domain.ts';
import { normalizeEquipment } from './equipment.ts';

export const GAME_DATA_KEY = 'kiseki-orbment.game-data.v1';
export const PLAYER_STATE_KEY = 'kiseki-orbment.player-state.v1';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function loadGameData(): GameData {
  if (typeof window === 'undefined') return clone(DEFAULT_GAME_DATA);
  try {
    const value = window.localStorage.getItem(GAME_DATA_KEY);
    if (!value) return clone(DEFAULT_GAME_DATA);
    const stored = JSON.parse(value) as GameData;
    // Local data may have been edited or imported even when it still carries a sample
    // version, so never replace it implicitly. The explicit reset action loads defaults.
    return stored;
  } catch {
    return clone(DEFAULT_GAME_DATA);
  }
}

export function normalizePlayerState(gameData: GameData, stored: Partial<PlayerState>): PlayerState {
  const fallback = createDefaultPlayerState(gameData);
  if (!stored.resources || !stored.slotLevels || !stored.lastSolver) return fallback;
  const resources = stored.resources;
  const slotLevels = stored.slotLevels;
  const lastSolver = { ...stored.lastSolver };

  const hasCurrentQuartz = gameData.quartz.some((quartz) => resources[quartz.id]);
  if (stored.version === 'player-0.1' && gameData.version === DEFAULT_GAME_DATA.version && !hasCurrentQuartz) return fallback;

  const normalizedResources = Object.fromEntries(gameData.quartz.map((quartz) => [
    quartz.id, resources[quartz.id] ?? fallback.resources[quartz.id],
  ]));
  const normalizedLevels = Object.fromEntries(gameData.characters.map((character) => [
    character.id, { ...fallback.slotLevels[character.id], ...slotLevels[character.id] },
  ]));
  if (!['available_only', 'owned_only', 'owned_plus_shop'].includes(lastSolver.resourceMode)) lastSolver.resourceMode = fallback.lastSolver.resourceMode;
  if (!gameData.characters.some((character) => character.id === lastSolver.characterId)) lastSolver.characterId = fallback.lastSolver.characterId;
  lastSolver.rankingPreset = 'extra_arts';
  lastSolver.timeoutSeconds = Number.isInteger(lastSolver.timeoutSeconds) && lastSolver.timeoutSeconds! >= 1 && lastSolver.timeoutSeconds! <= 120 ? lastSolver.timeoutSeconds : 10;
  lastSolver.mustHaveQuartz = [...new Set(Array.isArray(lastSolver.mustHaveQuartz) ? lastSolver.mustHaveQuartz : [])]
    .filter((id) => gameData.quartz.some((quartz) => quartz.id === id));
  const validArts = lastSolver.mustHaveArts.filter((id) => gameData.arts.some((art) => art.id === id));
  lastSolver.mustHaveArts = validArts.length || lastSolver.mustHaveArts.length === 0 ? validArts : fallback.lastSolver.mustHaveArts;
  return { version: fallback.version, resources: normalizedResources, slotLevels: normalizedLevels,
    equipment: normalizeEquipment(gameData, normalizedResources, stored.equipment ?? {}), lastSolver };
}

export function loadPlayerState(gameData: GameData): PlayerState {
  const fallback = createDefaultPlayerState(gameData);
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(PLAYER_STATE_KEY);
    if (!value) return fallback;
    return normalizePlayerState(gameData, JSON.parse(value) as Partial<PlayerState>);
  } catch {
    return fallback;
  }
}

export function saveGameData(gameData: GameData) {
  window.localStorage.setItem(GAME_DATA_KEY, JSON.stringify(gameData));
}

export function savePlayerState(playerState: PlayerState) {
  window.localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(playerState));
}

export function resetLocalData() {
  window.localStorage.removeItem(GAME_DATA_KEY);
  window.localStorage.removeItem(PLAYER_STATE_KEY);
}
