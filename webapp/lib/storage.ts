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
    // Replace only the pre-release sample bundled during development. Imported or edited
    // databases keep their own version and remain independent from player state.
    return stored.version === 'sample-0.1' ? clone(DEFAULT_GAME_DATA) : stored;
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
    for (const quartz of gameData.quartz) if (!stored.resources[quartz.id]) stored.resources[quartz.id] = fallback.resources[quartz.id];
    for (const character of gameData.characters) if (!stored.slotLevels[character.id]) stored.slotLevels[character.id] = fallback.slotLevels[character.id];
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
