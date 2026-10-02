import { DEFAULT_GAME_DATA, createDefaultPlayerState } from './default-data.ts';
import type { GameData, PlayerState } from './domain.ts';

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

export function loadPlayerState(gameData: GameData): PlayerState {
  const fallback = createDefaultPlayerState(gameData);
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(PLAYER_STATE_KEY);
    if (!value) return fallback;
    const stored = JSON.parse(value) as PlayerState;
    if (!stored.resources || !stored.slotLevels || !stored.lastSolver) return fallback;

    const hasCurrentQuartz = gameData.quartz.some((quartz) => stored.resources[quartz.id]);
    if (stored.version === 'player-0.1' && gameData.version === DEFAULT_GAME_DATA.version && !hasCurrentQuartz) return fallback;

    stored.version = fallback.version;
    stored.resources = Object.fromEntries(gameData.quartz.map((quartz) => [
      quartz.id,
      stored.resources[quartz.id] ?? fallback.resources[quartz.id],
    ]));
    stored.slotLevels = Object.fromEntries(gameData.characters.map((character) => [
      character.id,
      { ...fallback.slotLevels[character.id], ...(stored.slotLevels[character.id] ?? {}) },
    ]));
    if (!gameData.characters.some((character) => character.id === stored.lastSolver.characterId)) {
      stored.lastSolver.characterId = fallback.lastSolver.characterId;
    }
    const validArts = stored.lastSolver.mustHaveArts.filter((id) => gameData.arts.some((art) => art.id === id));
    stored.lastSolver.mustHaveArts = validArts.length || stored.lastSolver.mustHaveArts.length === 0
      ? validArts
      : fallback.lastSolver.mustHaveArts;
    return stored;
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
