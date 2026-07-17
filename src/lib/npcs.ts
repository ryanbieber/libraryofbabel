import { incidentForGallery } from './incidents'
import { STARTING_FLOOR, STARTING_GALLERY, worldKey, type FloorIndex, type GalleryIndex } from './level'
import { INTERACTION_RADIUS, type PlayerPose } from './roomGeometry'

export const NPC_GENERATION_VERSION = 'v1' as const
export const WANDERING_NPC_GENERATION_VERSION = 'v1' as const

export const WANDERING_ARCHETYPES = [
  'tired-comparer',
  'catalog-reconciler',
  'displaced-traveler',
  'quiet-inquirer',
  'forgotten-searcher',
  'suspicious-cataloger',
  'sentence-comparer',
] as const

export const WANDERING_ROUTE_IDS = ['east-aisle', 'outer-index', 'shelf-circuit'] as const

export type WanderingNpcArchetype = (typeof WANDERING_ARCHETYPES)[number] | 'knowledge-garage-reader'
export type WanderingRouteId = (typeof WANDERING_ROUTE_IDS)[number]
export type WanderingNpcActivity = 'walking' | 'examining-shelf' | 'comparing-notes' | 'pausing' | 'leaving'
export type WanderingNpcAccessory = 'single-book' | 'book-stack' | 'notes' | 'catalog-cards'

export type WanderingNpcTraits = {
  version: 1
  worldZoneKey: string
  archetype: WanderingNpcArchetype
  route: WanderingRouteId
  appearance: {
    palette: number
    stature: number
    accessory: WanderingNpcAccessory
  }
  pace: number
  phase: number
  activity: WanderingNpcActivity
}

export type NpcQuest = 'messiah' | 'crimson-book' | 'significant-word' | 'word-finder' | 'ambient'

export type LibraryNpc = {
  id: string
  floor: FloorIndex
  gallery: GalleryIndex
  name: string
  quest: NpcQuest
  dialogue: string[]
  position: { x: number; z: number }
  wandering?: WanderingNpcTraits
}

const NPC_POSITION = { x: -2.35, z: 0.65 } as const
const WORD_FINDER_POSITION = { x: 2.35, z: -0.65 } as const
const SPAWN_BUCKETS = 5
const WANDERING_SPAWN_BUCKETS = 9
const HOMAGE_SPAWN_BUCKETS = 4096

const messiahLines = [
  'Indexed one, forgive my dust. The catalog shivers when you pass, as if a page has learned to walk.',
  'Reader, if the Man of the Book is promised by any sane shelf, your shadow is at least his bookmark.',
  'Finder, I have praised every false sign with care, but your footsteps make even the margins kneel.',
]

const crimsonHexagonLines = [
  'Reader, hush. The Crimson Hexagon is a place in the old rumor, not one necessarily crimson-colored book.',
  'Finder, its rumored books are smaller than normal and illustrated; they are said to be magical and omnipotent.',
  'Indexed one, incompatible catalogs point toward the Crimson Hexagon with equal certainty. None agree on its floor.',
]

type WanderingArchetypeDefinition = {
  names: readonly string[]
  dialogueSets: readonly (readonly string[])[]
}

const wanderingArchetypeDefinitions: Record<WanderingNpcArchetype, WanderingArchetypeDefinition> = {
  'tired-comparer': {
    names: ['Weary reader of near-duplicates', 'Reader with sleepless margins'],
    dialogueSets: [
      ['I have checked this title four times. The fifth copy has the same errors in fresher ink.', 'No, this is not it. I think I will try the next one again.'],
      ['They look identical until page ninety-three. Then one comma moves.', 'I was more rested when I began comparing them.'],
    ],
  },
  'catalog-reconciler': {
    names: ['Reconciler of incompatible catalogs', 'Librarian of disputed entries'],
    dialogueSets: [
      ['One catalog says the volume is here. Another insists this gallery has never existed.', 'I have decided to believe both until one apologizes.'],
      ['These two entries agree on every coordinate and disagree on the book.', 'There must be a very orderly explanation.'],
    ],
  },
  'displaced-traveler': {
    names: ['Traveler with obsolete coordinates', 'Wayfarer of the crossed-out shelf'],
    dialogueSets: [
      ['My note says “third shelf after the blue ladder.” There has never been a blue ladder here.', 'I will follow the numbers once more.'],
      ['These coordinates were exact when I wrote them. Now the wall calls itself something else.', 'Perhaps I arrived correctly in the wrong Library.'],
    ],
  },
  'quiet-inquirer': {
    names: ['Quiet seeker of a remembered fragment', 'Reader asking along the shelves'],
    dialogueSets: [
      ['Have you seen a book with a white bird beneath a black sun?', 'No need to stop. I ask everyone I pass.'],
      ['I am looking for the phrase “after the seventh image,” followed by three blank pages.', 'If it sounds familiar, a nod will do.'],
    ],
  },
  'forgotten-searcher': {
    names: ['Searcher without an object', 'Discouraged visitor to the index'],
    dialogueSets: [
      ['I know I came to find something urgent. I can no longer remember whether it was a book.', 'Perhaps recognition will be enough.'],
      ['The search is going badly, though I have forgotten its standard for success.', 'I will keep looking until the question returns.'],
    ],
  },
  'suspicious-cataloger': {
    names: ['Cataloger of altered plaques', 'Indexer watching the wall signs'],
    dialogueSets: [
      ['That plaque had a different numeral a moment ago. The screws are still warm.', 'Write down what you see before it notices.'],
      ['Someone is correcting the catalog by changing the Library.', 'I intend to catch the next wall in the act.'],
    ],
  },
  'sentence-comparer': {
    names: ['Reader of the single differing sentence', 'Comparator of identical volumes'],
    dialogueSets: [
      ['These books differ by one sentence. Unfortunately, the sentence keeps changing places.', 'I need only compare them all again.'],
      ['Same cover, same pages, same stains. One of them remembers a sentence the others deny.', 'Please do not rearrange this stack.'],
    ],
  },
  'knowledge-garage-reader': {
    names: ['Eccentric reader of vehicular means', 'Enthusiast of books and fast machinery'],
    dialogueSets: [
      ['Look at these shelves: pure knowledge. My Lamborghinis are in a garage somewhere outside, but the books are the real fleet.', 'Now I only need a freight lift large enough to bring the Lamborghinis into the Library.'],
      ['Books increase knowledge; I say this enthusiastically because it remains true. I also have Lamborghinis in a garage—or had, before the galleries became infinite.', 'A vehicle gets you somewhere quickly. Knowledge tells you which endless shelf was worth reaching.'],
    ],
  },
}

type RouteWaypoint = {
  x: number
  z: number
  hold: number
  activity: Exclude<WanderingNpcActivity, 'walking'>
}

const wanderingRoutes: Record<WanderingRouteId, readonly RouteWaypoint[]> = {
  'east-aisle': [
    { x: 2.2, z: -3.2, hold: 4, activity: 'examining-shelf' },
    { x: 3.05, z: -1.85, hold: 2, activity: 'comparing-notes' },
    { x: 2.05, z: -1.42, hold: 1, activity: 'pausing' },
    { x: 2.05, z: 1.42, hold: 2, activity: 'comparing-notes' },
    { x: 3.05, z: 1.85, hold: 3, activity: 'examining-shelf' },
    { x: 2.2, z: 3.2, hold: 4, activity: 'leaving' },
    { x: 3.05, z: 1.85, hold: 1, activity: 'pausing' },
    { x: 2.05, z: 1.42, hold: 2, activity: 'comparing-notes' },
    { x: 2.05, z: -1.42, hold: 1, activity: 'pausing' },
    { x: 3.05, z: -1.85, hold: 2, activity: 'comparing-notes' },
  ],
  'outer-index': [
    { x: 3.05, z: -2.55, hold: 3, activity: 'examining-shelf' },
    { x: 3.55, z: -0.9, hold: 2, activity: 'comparing-notes' },
    { x: 2.1, z: -1.48, hold: 1, activity: 'pausing' },
    { x: 2.1, z: 1.48, hold: 2, activity: 'comparing-notes' },
    { x: 3.55, z: 0.9, hold: 3, activity: 'examining-shelf' },
    { x: 3.05, z: 2.55, hold: 2, activity: 'leaving' },
    { x: 3.55, z: 0.9, hold: 1, activity: 'pausing' },
    { x: 2.1, z: 1.48, hold: 2, activity: 'comparing-notes' },
    { x: 2.1, z: -1.48, hold: 1, activity: 'pausing' },
    { x: 3.55, z: -0.9, hold: 2, activity: 'comparing-notes' },
  ],
  'shelf-circuit': [
    { x: 1.75, z: -2.85, hold: 3, activity: 'leaving' },
    { x: 2.85, z: -2.05, hold: 3, activity: 'examining-shelf' },
    { x: 3.35, z: 0, hold: 2, activity: 'comparing-notes' },
    { x: 2.85, z: 2.05, hold: 3, activity: 'examining-shelf' },
    { x: 1.75, z: 2.85, hold: 3, activity: 'leaving' },
    { x: 2.85, z: 2.05, hold: 1, activity: 'pausing' },
    { x: 3.35, z: 0, hold: 2, activity: 'comparing-notes' },
    { x: 2.85, z: -2.05, hold: 1, activity: 'pausing' },
  ],
}

export function npcForGallery(floor: FloorIndex, gallery: GalleryIndex): LibraryNpc | null {
  if (floor === STARTING_FLOOR && gallery === STARTING_GALLERY) {
    return {
      id: 'monk:0:0',
      floor,
      gallery,
      name: 'Hooded keeper of improbable words',
      quest: 'significant-word',
      dialogue: [
        'Reader, bring me a book that contains the word babel.',
        'Tell me the floor, gallery, wall, row, book, and page, and I will test the page myself.',
        'Most pilgrims return with arithmetic and call it faith. I prefer coordinates.',
      ],
      position: NPC_POSITION,
    }
  }

  const spawnHash = stableHash(`library-monk:${floor}:${gallery}`)
  if ((spawnHash + 1) % SPAWN_BUCKETS !== 0) return null

  const quest: NpcQuest = stableHash(`library-monk-quest:${floor}:${gallery}`) % 2 === 0 ? 'messiah' : 'crimson-book'
  const sourceLines = quest === 'messiah' ? messiahLines : crimsonHexagonLines
  const start = stableHash(`library-monk-dialogue:${floor}:${gallery}`) % sourceLines.length
  return {
    id: `monk:${floor}:${gallery}`,
    floor,
    gallery,
    name: quest === 'messiah' ? 'Hooded devotee of the index' : 'Hooded keeper of the Crimson rumor',
    quest,
    dialogue: sourceLines.map((_, index) => sourceLines[(start + index) % sourceLines.length]),
    position: NPC_POSITION,
  }
}

export function npcsForGallery(floor: FloorIndex, gallery: GalleryIndex): LibraryNpc[] {
  const resident = npcForGallery(floor, gallery)
  if (floor !== STARTING_FLOOR || gallery !== STARTING_GALLERY) {
    if (resident) return [resident]
    const wanderer = wanderingNpcForGallery(floor, gallery)
    return wanderer ? [wanderer] : []
  }

  return [
    ...(resident ? [resident] : []),
    {
      id: 'word-finder:0:0',
      floor,
      gallery,
      name: 'Hooded indexer of lost words',
      quest: 'word-finder',
      dialogue: [
        'Reader, if you would look for a word, I have found many in my long attendance here.',
        'Give me one word. I will tell you the floor, gallery, wall, row, book, and page where it waits.',
        'No word is lost in the Library. Some are merely very far from the question that summoned them.',
      ],
      position: WORD_FINDER_POSITION,
    },
  ]
}

/**
 * Ambient readers are sparse, derived inhabitants. They deliberately avoid the
 * starting gallery, resident NPCs, and incident galleries so no existing
 * interaction or authored scenery has to share its limited floor space.
 */
export function wanderingNpcForGallery(floor: FloorIndex, gallery: GalleryIndex): LibraryNpc | null {
  if (floor === STARTING_FLOOR && gallery === STARTING_GALLERY) return null
  if (npcForGallery(floor, gallery) || incidentForGallery(floor, gallery)) return null

  const worldZoneKey = worldKey(floor, { kind: 'gallery', gallery })
  const homage = stableHash(`wandering-npc:homage:${WANDERING_NPC_GENERATION_VERSION}:${worldZoneKey}`) % HOMAGE_SPAWN_BUCKETS === 0
  if (!homage && stableHash(`wandering-npc:spawn:${WANDERING_NPC_GENERATION_VERSION}:${worldZoneKey}`) % WANDERING_SPAWN_BUCKETS !== 0) return null

  const archetype = homage
    ? 'knowledge-garage-reader'
    : WANDERING_ARCHETYPES[stableHash(`wandering-npc:archetype:${worldZoneKey}`) % WANDERING_ARCHETYPES.length]
  const definition = wanderingArchetypeDefinitions[archetype]
  const traits: WanderingNpcTraits = {
    version: 1,
    worldZoneKey,
    archetype,
    route: WANDERING_ROUTE_IDS[stableHash(`wandering-npc:route:${worldZoneKey}`) % WANDERING_ROUTE_IDS.length],
    appearance: {
      palette: stableHash(`wandering-npc:palette:${worldZoneKey}`) % 6,
      stature: [0.94, 1, 1.06][stableHash(`wandering-npc:stature:${worldZoneKey}`) % 3],
      accessory: (['single-book', 'book-stack', 'notes', 'catalog-cards'] as const)[stableHash(`wandering-npc:accessory:${worldZoneKey}`) % 4],
    },
    pace: 0.34 + (stableHash(`wandering-npc:pace:${worldZoneKey}`) % 5) * 0.025,
    phase: (stableHash(`wandering-npc:phase:${worldZoneKey}`) % 45_000) / 1000,
    activity: 'walking',
  }
  const initialPose = wanderingNpcPoseAtTraits(traits, 0)
  traits.activity = initialPose.activity

  return {
    id: `wanderer:${worldZoneKey}`,
    floor,
    gallery,
    name: definition.names[stableHash(`wandering-npc:name:${worldZoneKey}`) % definition.names.length],
    quest: 'ambient',
    dialogue: [...definition.dialogueSets[stableHash(`wandering-npc:dialogue:${worldZoneKey}`) % definition.dialogueSets.length]],
    position: initialPose.position,
    wandering: traits,
  }
}

export function wanderingNpcAtTime(npc: LibraryNpc, elapsedSeconds: number): LibraryNpc {
  if (!npc.wandering) return npc
  const pose = wanderingNpcPoseAtTraits(npc.wandering, elapsedSeconds)
  return {
    ...npc,
    position: pose.position,
    wandering: { ...npc.wandering, activity: pose.activity },
  }
}

export function wanderingNpcPoseAt(npc: LibraryNpc, elapsedSeconds: number): {
  position: { x: number; z: number }
  activity: WanderingNpcActivity
} {
  if (!npc.wandering) return { position: npc.position, activity: 'pausing' }
  return wanderingNpcPoseAtTraits(npc.wandering, elapsedSeconds)
}

export function nearestNpc(pose: PlayerPose, npcs: LibraryNpc[]): LibraryNpc | null {
  let nearest: LibraryNpc | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const npc of npcs) {
    const distance = distanceToNpc(pose, npc)
    if (distance < nearestDistance) {
      nearest = npc
      nearestDistance = distance
    }
  }
  return nearest
}

export function distanceToNpc(pose: PlayerPose, npc: LibraryNpc | null): number {
  if (!npc || pose.floor !== npc.floor || pose.zone.kind !== 'gallery' || pose.zone.gallery !== npc.gallery) {
    return Number.POSITIVE_INFINITY
  }
  return Math.hypot(pose.x - npc.position.x, pose.z - npc.position.z)
}

export function isNpcReachable(pose: PlayerPose, npc: LibraryNpc | null): boolean {
  return distanceToNpc(pose, npc) <= INTERACTION_RADIUS
}

function wanderingNpcPoseAtTraits(traits: WanderingNpcTraits, elapsedSeconds: number): {
  position: { x: number; z: number }
  activity: WanderingNpcActivity
} {
  const waypoints = wanderingRoutes[traits.route]
  const cycleDuration = waypoints.reduce((duration, waypoint, index) => {
    const next = waypoints[(index + 1) % waypoints.length]
    return duration + waypoint.hold + Math.hypot(next.x - waypoint.x, next.z - waypoint.z) / traits.pace
  }, 0)
  let cycleTime = ((elapsedSeconds + traits.phase) % cycleDuration + cycleDuration) % cycleDuration

  for (let index = 0; index < waypoints.length; index += 1) {
    const waypoint = waypoints[index]
    if (cycleTime < waypoint.hold) {
      return { position: { x: waypoint.x, z: waypoint.z }, activity: waypoint.activity }
    }
    cycleTime -= waypoint.hold

    const next = waypoints[(index + 1) % waypoints.length]
    const travelDuration = Math.hypot(next.x - waypoint.x, next.z - waypoint.z) / traits.pace
    if (cycleTime < travelDuration) {
      const progress = cycleTime / travelDuration
      return {
        position: {
          x: waypoint.x + (next.x - waypoint.x) * progress,
          z: waypoint.z + (next.z - waypoint.z) * progress,
        },
        activity: 'walking',
      }
    }
    cycleTime -= travelDuration
  }

  return { position: { x: waypoints[0].x, z: waypoints[0].z }, activity: waypoints[0].activity }
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
