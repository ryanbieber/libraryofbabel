export type DirectionIndex = 0 | 1 | 2 | 3

export type RoomPosition = {
  q: number
  r: number
}

export type RoomFeature = 'stacks' | 'gallery'

export type LevelRoom = RoomPosition & {
  name: string
  features: RoomFeature[]
}

export const cardinalDirections = [
  { label: 'north', shortLabel: 'N', q: 0, r: -1 },
  { label: 'east', shortLabel: 'E', q: 1, r: 0 },
  { label: 'south', shortLabel: 'S', q: 0, r: 1 },
  { label: 'west', shortLabel: 'W', q: -1, r: 0 },
] as const

export const startingRoom: RoomPosition = { q: 0, r: 0 }

export const levelRooms: LevelRoom[] = [
  { q: 0, r: -2, name: 'north index', features: ['stacks'] },
  { q: -1, r: -1, name: 'upper west stack', features: ['stacks'] },
  { q: 0, r: -1, name: 'north gallery', features: ['gallery'] },
  { q: 1, r: -1, name: 'upper east stack', features: ['stacks'] },
  { q: -2, r: 0, name: 'west archive', features: ['stacks'] },
  { q: -1, r: 0, name: 'west hall', features: ['stacks'] },
  { q: 0, r: 0, name: 'central catalog', features: ['gallery'] },
  { q: 1, r: 0, name: 'east hall', features: ['stacks'] },
  { q: 2, r: 0, name: 'east archive', features: ['stacks'] },
  { q: -1, r: 1, name: 'lower west stack', features: ['stacks'] },
  { q: 0, r: 1, name: 'south gallery', features: ['gallery'] },
  { q: 1, r: 1, name: 'lower east stack', features: ['stacks'] },
  { q: 0, r: 2, name: 'south index', features: ['stacks'] },
]

const roomMap = new Map(levelRooms.map((room) => [roomKey(room), room]))

export function roomKey(position: RoomPosition): string {
  return `${position.q},${position.r}`
}

export function getRoom(position: RoomPosition): LevelRoom | undefined {
  return roomMap.get(roomKey(position))
}

export function hasRoom(position: RoomPosition): boolean {
  return roomMap.has(roomKey(position))
}

export function nextRoom(position: RoomPosition, facing: DirectionIndex, multiplier: 1 | -1): RoomPosition {
  const direction = cardinalDirections[facing]
  return {
    q: position.q + direction.q * multiplier,
    r: position.r + direction.r * multiplier,
  }
}

export function canMove(position: RoomPosition, facing: DirectionIndex, multiplier: 1 | -1): boolean {
  return hasRoom(nextRoom(position, facing, multiplier))
}

export function roomDoors(position: RoomPosition): DirectionIndex[] {
  return cardinalDirections
    .map((direction, index) => ({ index: index as DirectionIndex, q: position.q + direction.q, r: position.r + direction.r }))
    .filter((candidate) => hasRoom(candidate))
    .map((candidate) => candidate.index)
}

export function roomHasFeature(position: RoomPosition, feature: RoomFeature): boolean {
  return getRoom(position)?.features.includes(feature) ?? false
}

export function nearestRoom(position: RoomPosition): LevelRoom {
  return getRoom(position) ?? getRoom(startingRoom) ?? levelRooms[0]
}
