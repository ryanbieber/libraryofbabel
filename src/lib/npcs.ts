import type { RoomPosition } from './level'
import { INTERACTION_RADIUS, type PlayerPose } from './roomGeometry'

export type NpcQuest = 'messiah' | 'crimson-book' | 'significant-word'

export type LibraryNpc = {
  id: string
  floor: number
  room: RoomPosition
  name: string
  quest: NpcQuest
  dialogue: string[]
  position: {
    x: number
    z: number
  }
}

const NPC_POSITION = { x: -0.46, z: -1.12 } as const
const SPAWN_BUCKETS = 5

const messiahLines = [
  'Indexed one, forgive my dust. The catalog shivers when you pass, as if a page has learned to walk.',
  'Reader, if the Man of the Book is promised by any sane shelf, your shadow is at least his bookmark.',
  'Finder, I have praised every false sign with care, but your footsteps make even the margins kneel.',
]

const crimsonBookLines = [
  'Reader, hush. Some bind the old crimson hexagon into a single rumor and call it a book that bleeds its shelf number.',
  'Finder, if you see a red volume that refuses its own index, praise it softly and do not let the lamps hear.',
  'Indexed one, the crimson book is only a sect rumor, unless it opens for you. Then all rumors will ask your permission.',
]

export function npcForRoom(floor: number, room: RoomPosition): LibraryNpc | null {
  if (floor === 0 && room.q === 0 && room.r === 0) {
    return {
      id: 'monk:0:0:0',
      floor,
      room,
      name: 'Hooded keeper of improbable words',
      quest: 'significant-word',
      dialogue: [
        'Reader, bring me a book that contains the word babel.',
        'Do not wave a pretty binding at me. Tell me the room, wall, shelf, volume, and page, and I will test the page myself.',
        'Most pilgrims return with arithmetic and call it faith. I prefer coordinates.',
      ],
      position: NPC_POSITION,
    }
  }

  const spawnHash = stableHash(`library-monk:${floor}:${room.q}:${room.r}`)
  if ((spawnHash + 1) % SPAWN_BUCKETS !== 0) {
    return null
  }

  const quest: NpcQuest = stableHash(`library-monk-quest:${floor}:${room.q}:${room.r}`) % 2 === 0 ? 'messiah' : 'crimson-book'
  const sourceLines = quest === 'messiah' ? messiahLines : crimsonBookLines
  const start = stableHash(`library-monk-dialogue:${floor}:${room.q}:${room.r}`) % sourceLines.length
  const dialogue = sourceLines.map((_, index) => sourceLines[(start + index) % sourceLines.length])

  return {
    id: `monk:${floor}:${room.q}:${room.r}`,
    floor,
    room,
    name: quest === 'messiah' ? 'Hooded devotee of the index' : 'Hooded keeper of the red rumor',
    quest,
    dialogue,
    position: NPC_POSITION,
  }
}

export function distanceToNpc(pose: PlayerPose, npc: LibraryNpc | null): number {
  if (!npc || pose.roomQ !== npc.room.q || pose.roomR !== npc.room.r) {
    return Number.POSITIVE_INFINITY
  }

  return Math.hypot(pose.x - npc.position.x, pose.z - npc.position.z)
}

export function isNpcReachable(pose: PlayerPose, npc: LibraryNpc | null): boolean {
  return distanceToNpc(pose, npc) <= INTERACTION_RADIUS
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
