import {
  STARTING_FLOOR,
  STARTING_GALLERY,
  worldKey,
  type FloorIndex,
  type GalleryIndex,
} from './level'

export const INCIDENT_GENERATION_VERSION = 'v1' as const

export const INCIDENT_KINDS = [
  'purifier-damage',
  'contradictory-catalogs',
  'abandoned-belongings',
  'shaft-omen',
] as const

export type IncidentKind = (typeof INCIDENT_KINDS)[number]

export type GalleryIncident = {
  version: 1
  worldZoneKey: string
  kind: IncidentKind
  variant: number
}

const INCIDENT_BUCKETS = 4
const INCIDENT_SELECTION_SEED = 'babel-incidents:'

/**
 * Gallery incidents are derived scenery, not mutable journey state. Keeping the
 * version and zone key in the result makes the assignment safe to serialize for
 * tests, diagnostics, or a future cache without coupling it to generated pages.
 */
export function incidentForGallery(floor: FloorIndex, gallery: GalleryIndex): GalleryIncident | null {
  if (floor === STARTING_FLOOR && gallery === STARTING_GALLERY) return null

  const worldZoneKey = worldKey(floor, { kind: 'gallery', gallery })
  if (stableHash(`${INCIDENT_SELECTION_SEED}${worldZoneKey}`) % INCIDENT_BUCKETS !== 0) return null

  return {
    version: 1,
    worldZoneKey,
    kind: INCIDENT_KINDS[(stableHash(`kind5:${worldZoneKey}`) >>> 8) % INCIDENT_KINDS.length],
    variant: (stableHash(`variant:${worldZoneKey}`) >>> 8) % 8,
  }
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
