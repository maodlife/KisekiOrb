import { ELEMENTS, type Art, type ElementKey } from './domain.ts';

export type ArtGroupId = ElementKey | 'none';
export const ART_GROUPS: ArtGroupId[] = [...ELEMENTS, 'none'];

// Use the same element order as the requirements shown beside each art.
export function getArtGroup(art: Pick<Art, 'requirements'>): ArtGroupId {
  return ELEMENTS.find((element) => art.requirements[element] > 0) ?? 'none';
}

export function groupArtsByFirstElement(arts: Art[]) {
  const groups = ART_GROUPS.map((id) => ({ id, arts: [] as Art[] }));
  for (const art of arts) {
    groups.find((group) => group.id === getArtGroup(art))!.arts.push(art);
  }
  return groups.filter((group) => group.arts.length > 0);
}
