import artsSource from '../data/arts.json' with { type: 'json' };
import charactersSource from '../data/characters.json' with { type: 'json' };
import resourcesSource from '../data/default-resources.json' with { type: 'json' };
import quartzSource from '../data/quartz.json' with { type: 'json' };
import type { Art, Character, GameData, PlayerState, Quartz, QuartzResource } from './domain.ts';

const characters = charactersSource.characters as unknown as Character[];
const quartz = quartzSource.quartz as unknown as Quartz[];
const arts = artsSource.arts as unknown as Art[];
const screenshotResources = resourcesSource.resources as unknown as Record<string, QuartzResource>;

export const DEFAULT_GAME_DATA: GameData = {
  version: 'screenshots-2026-10-02',
  characters,
  quartz,
  arts,
};

export function createDefaultPlayerState(gameData: GameData = DEFAULT_GAME_DATA): PlayerState {
  return {
    version: 'player-0.3',
    resources: Object.fromEntries(gameData.quartz.map((item) => {
      const screenshotResource = screenshotResources[item.id];
      return [item.id, screenshotResource
        ? { ...screenshotResource }
        : { quartzId: item.id, ownedCount: 0, shopAvailable: false, shopPrice: null, shopPurchaseLimit: null }];
    })),
    slotLevels: Object.fromEntries(gameData.characters.map((character) => [
      character.id,
      Object.fromEntries(character.slots.map((slot) => [String(slot.id), slot.currentLevel])),
    ])),
    equipment: Object.fromEntries(gameData.characters.map((character) => [
      character.id, Object.fromEntries(character.slots.map((slot) => [slot.id, null])),
    ])),
    lastSolver: {
      characterId: gameData.characters[0]?.id ?? '',
      resourceMode: 'owned_only',
      mustHaveArts: gameData.arts.some((item) => item.id === 'art-water-06') && gameData.arts.some((item) => item.id === 'art-time-07')
        ? ['art-water-06', 'art-time-07']
        : [],
      rankingPreset: 'resource',
    },
  };
}
