import {
  adjacentFloor,
  galleriesForConnector,
  isConnectorIndex,
  isFloorIndex,
  isGalleryIndex,
  northConnector,
  southConnector,
  type ConnectorIndex,
  type FloorIndex,
  type GalleryIndex,
  type WorldZone,
} from './level'
import {
  BOOKS_PER_SHELF,
  SHELF_WALLS,
  type BookAddress,
  type ShelfWall,
} from './library'

export type PlayerPose = {
  floor: FloorIndex
  zone: WorldZone
  x: number
  y: number
  z: number
  yaw: number
}

export type MoveResult = {
  pose: PlayerPose
  transition?: 'gallery' | 'vestibule' | 'service' | 'stairs' | 'floor'
  blocked?: 'wall' | 'lightwell' | 'gate' | 'landing'
}

export const GALLERY_APOTHEM = 5.4
export const GALLERY_RADIUS = GALLERY_APOTHEM / Math.cos(Math.PI / 6)
export const FLOOR_HEIGHT = 3.4
export const PLAYER_EYE_HEIGHT = 1.6
export const PLAYER_RADIUS = 0.22
export const PASSAGE_HALF_WIDTH = 0.75
export const LIGHTWELL_RADIUS = 1.15
export const RAILING_HEIGHT = 0.9
export const VESTIBULE_HALF_DEPTH = 1.7
export const VESTIBULE_HALF_WIDTH = 2.7
export const INTERACTION_RADIUS = 1.35
export const BOOK_INTERACTION_RADIUS = 1.75
export const STEP_DISTANCE = 0.74
export const WALK_SPEED = 2.75
export const SHELF_WIDTH = GALLERY_RADIUS - 0.72
export const STAIR_TRAVEL_DISTANCE = 7.8

export const STARTING_PLAYER_POSE: PlayerPose = {
  floor: 0,
  zone: { kind: 'gallery', gallery: 0 },
  x: 0,
  y: 0,
  z: 4.35,
  yaw: 0,
}

const WALL_NORMALS: Record<ShelfWall, readonly [number, number]> = {
  A: [Math.sqrt(3) / 2, -0.5],
  B: [Math.sqrt(3) / 2, 0.5],
  C: [-Math.sqrt(3) / 2, 0.5],
  D: [-Math.sqrt(3) / 2, -0.5],
}

export function normalizeYaw(yaw: number): number {
  const fullTurn = Math.PI * 2
  return ((yaw % fullTurn) + fullTurn) % fullTurn
}

export function rotatePose(pose: PlayerPose, deltaYaw: number): PlayerPose {
  return { ...pose, yaw: normalizeYaw(pose.yaw + deltaYaw) }
}

export function movePose(pose: PlayerPose, forward: number, strafe: number, distance: number): MoveResult {
  const inputMagnitude = Math.hypot(forward, strafe)
  if (inputMagnitude === 0 || distance <= 0) return { pose }

  if (pose.zone.kind === 'stair') {
    if (forward <= 0) return { pose }
    const progress = Math.min(1, pose.zone.progress + distance / STAIR_TRAVEL_DISTANCE)
    if (progress >= 1) {
      return {
        pose: {
          floor: pose.zone.to,
          zone: { kind: 'vestibule', connector: pose.zone.connector },
          x: VESTIBULE_HALF_WIDTH - 0.3,
          y: 0,
          z: pose.zone.to > pose.zone.from ? -0.45 : 0.45,
          yaw: -Math.PI / 2,
        },
        transition: 'floor',
      }
    }
    return {
      pose: { ...pose, zone: { ...pose.zone, progress } },
      transition: 'stairs',
    }
  }

  const scale = distance / inputMagnitude
  const dx = (Math.sin(pose.yaw) * forward + Math.cos(pose.yaw) * strafe) * scale
  const dz = (-Math.cos(pose.yaw) * forward + Math.sin(pose.yaw) * strafe) * scale
  const targetX = pose.x + dx
  const targetZ = pose.z + dz

  switch (pose.zone.kind) {
    case 'gallery':
      return moveInGallery(pose, pose.zone.gallery, targetX, targetZ)
    case 'vestibule':
      return moveInVestibule(pose, pose.zone.connector, targetX, targetZ)
    case 'service':
      return moveInServiceRoom(pose, targetX, targetZ)
  }
}

function moveInGallery(
  pose: PlayerPose,
  gallery: GalleryIndex,
  targetX: number,
  targetZ: number,
): MoveResult {
  const passageLimit = PASSAGE_HALF_WIDTH - PLAYER_RADIUS * 0.25
  if (targetZ < -GALLERY_APOTHEM + PLAYER_RADIUS && Math.abs(targetX) <= passageLimit) {
    return {
      pose: { ...pose, zone: { kind: 'vestibule', connector: northConnector(gallery) }, x: targetX, z: VESTIBULE_HALF_DEPTH - 0.12 },
      transition: 'vestibule',
    }
  }
  if (targetZ > GALLERY_APOTHEM - PLAYER_RADIUS && Math.abs(targetX) <= passageLimit) {
    return {
      pose: { ...pose, zone: { kind: 'vestibule', connector: southConnector(gallery) }, x: targetX, z: -VESTIBULE_HALF_DEPTH + 0.12 },
      transition: 'vestibule',
    }
  }

  const z = clamp(targetZ, -GALLERY_APOTHEM + PLAYER_RADIUS, GALLERY_APOTHEM - PLAYER_RADIUS)
  const maxX = GALLERY_RADIUS - Math.abs(z) / Math.sqrt(3) - PLAYER_RADIUS
  const x = clamp(targetX, -maxX, maxX)
  const exclusion = LIGHTWELL_RADIUS + PLAYER_RADIUS
  if (Math.hypot(x, z) < exclusion) {
    return { pose, blocked: 'lightwell' }
  }
  return { pose: { ...pose, x, z, y: 0 } }
}

function moveInVestibule(
  pose: PlayerPose,
  connector: ConnectorIndex,
  targetX: number,
  targetZ: number,
): MoveResult {
  const neighbors = galleriesForConnector(connector)
  if (targetZ < -VESTIBULE_HALF_DEPTH + PLAYER_RADIUS && Math.abs(targetX) <= PASSAGE_HALF_WIDTH) {
    if (neighbors.north === null) return { pose, blocked: 'gate' }
    return {
      pose: { ...pose, zone: { kind: 'gallery', gallery: neighbors.north }, x: targetX, z: GALLERY_APOTHEM - 0.32 },
      transition: 'gallery',
    }
  }
  if (targetZ > VESTIBULE_HALF_DEPTH - PLAYER_RADIUS && Math.abs(targetX) <= PASSAGE_HALF_WIDTH) {
    if (neighbors.south === null) return { pose, blocked: 'gate' }
    return {
      pose: { ...pose, zone: { kind: 'gallery', gallery: neighbors.south }, x: targetX, z: -GALLERY_APOTHEM + 0.32 },
      transition: 'gallery',
    }
  }

  if (targetX < -VESTIBULE_HALF_WIDTH + PLAYER_RADIUS) {
    if (Math.abs(targetZ) < 0.18) return { pose, blocked: 'wall' }
    const room = targetZ < 0 ? 'sleeping' : 'latrine'
    return {
      pose: { ...pose, zone: { kind: 'service', connector, room }, x: 1.72, z: room === 'sleeping' ? 0.45 : -0.45 },
      transition: 'service',
    }
  }

  if (targetX > VESTIBULE_HALF_WIDTH - PLAYER_RADIUS && Math.abs(targetZ) <= 0.8) {
    const direction: -1 | 1 = pose.floor === -1 ? 1 : pose.floor === 1 ? -1 : targetZ <= 0 ? 1 : -1
    const destination = adjacentFloor(pose.floor, direction)
    if (destination === null) return { pose, blocked: 'landing' }
    return {
      pose: {
        ...pose,
        zone: { kind: 'stair', connector, from: pose.floor, to: destination, progress: 0 },
        x: 0,
        y: 0,
        z: 0,
      },
      transition: 'stairs',
    }
  }

  return {
    pose: {
      ...pose,
      x: clamp(targetX, -VESTIBULE_HALF_WIDTH + PLAYER_RADIUS, VESTIBULE_HALF_WIDTH - PLAYER_RADIUS),
      z: clamp(targetZ, -VESTIBULE_HALF_DEPTH + PLAYER_RADIUS, VESTIBULE_HALF_DEPTH - PLAYER_RADIUS),
      y: 0,
    },
  }
}

function moveInServiceRoom(pose: PlayerPose, targetX: number, targetZ: number): MoveResult {
  if (targetX > 1.8 - PLAYER_RADIUS && Math.abs(targetZ) <= 0.82) {
    const room = pose.zone.kind === 'service' ? pose.zone.room : 'sleeping'
    const connector = pose.zone.kind === 'service' ? pose.zone.connector : 0
    return {
      pose: {
        ...pose,
        zone: { kind: 'vestibule', connector },
        x: -VESTIBULE_HALF_WIDTH + 0.3,
        z: room === 'sleeping' ? -0.55 : 0.55,
      },
      transition: 'vestibule',
    }
  }
  return {
    pose: { ...pose, x: clamp(targetX, -1.8 + PLAYER_RADIUS, 1.8 - PLAYER_RADIUS), z: clamp(targetZ, -1.35, 1.35), y: 0 },
  }
}

export function stairCameraPose(pose: PlayerPose): { x: number; y: number; z: number; yaw: number } {
  if (pose.zone.kind !== 'stair') return { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw }
  const angle = -Math.PI / 2 + pose.zone.progress * Math.PI * 2
  const ascending = pose.zone.to > pose.zone.from
  const elevation = (ascending ? pose.zone.progress : 1 - pose.zone.progress) * FLOOR_HEIGHT
  return {
    x: Math.cos(angle) * 1.2,
    y: elevation,
    z: Math.sin(angle) * 1.2,
    yaw: normalizeYaw(Math.PI - angle),
  }
}

export function booksForGallery(floor: FloorIndex, gallery: GalleryIndex): BookAddress[] {
  return SHELF_WALLS.flatMap((wall) =>
    Array.from({ length: 5 }, (_, shelf) =>
      Array.from({ length: BOOKS_PER_SHELF }, (_, book) => ({ floor, gallery, wall, shelf, book })),
    ).flat(),
  )
}

export function wallNormal(wall: ShelfWall): readonly [number, number] {
  return WALL_NORMALS[wall]
}

export function bookWorldPosition(address: BookAddress): { x: number; z: number } {
  const normal = wallNormal(address.wall)
  const tangent = [normal[1], -normal[0]] as const
  const offset = -SHELF_WIDTH / 2 + ((address.book + 0.5) * SHELF_WIDTH) / BOOKS_PER_SHELF
  return {
    x: normal[0] * (GALLERY_APOTHEM - 0.18) + tangent[0] * offset,
    z: normal[1] * (GALLERY_APOTHEM - 0.18) + tangent[1] * offset,
  }
}

export function distanceToBook(pose: PlayerPose, address: BookAddress): number {
  if (pose.zone.kind !== 'gallery' || pose.floor !== address.floor || pose.zone.gallery !== address.gallery) {
    return Number.POSITIVE_INFINITY
  }
  const position = bookWorldPosition(address)
  return Math.hypot(pose.x - position.x, pose.z - position.z)
}

export function isBookReachable(pose: PlayerPose, address: BookAddress): boolean {
  return distanceToBook(pose, address) <= BOOK_INTERACTION_RADIUS
}

export function poseNearBook(address: BookAddress): PlayerPose {
  const position = bookWorldPosition(address)
  const normal = wallNormal(address.wall)
  return {
    floor: address.floor,
    zone: { kind: 'gallery', gallery: address.gallery },
    x: position.x - normal[0] * 1.05,
    y: 0,
    z: position.z - normal[1] * 1.05,
    yaw: normalizeYaw(Math.atan2(normal[0], -normal[1])),
  }
}

export function isValidPlayerPose(value: unknown): value is PlayerPose {
  if (!value || typeof value !== 'object') return false
  const pose = value as Partial<PlayerPose>
  if (!isFloorIndex(Number(pose.floor)) || !Number.isFinite(pose.x) || !Number.isFinite(pose.y) || !Number.isFinite(pose.z) || !Number.isFinite(pose.yaw)) return false
  if (Math.abs(Number(pose.x)) > 10 || Math.abs(Number(pose.z)) > 10 || Number(pose.y) < 0 || Number(pose.y) > FLOOR_HEIGHT) return false
  const zone = pose.zone
  if (!zone || typeof zone !== 'object' || typeof zone.kind !== 'string') return false
  if (zone.kind === 'gallery') return isGalleryIndex(Number(zone.gallery))
  if (zone.kind === 'vestibule') return isConnectorIndex(Number(zone.connector))
  if (zone.kind === 'service') return isConnectorIndex(Number(zone.connector)) && (zone.room === 'sleeping' || zone.room === 'latrine')
  if (zone.kind === 'stair') {
    return isConnectorIndex(Number(zone.connector)) && isFloorIndex(Number(zone.from)) && isFloorIndex(Number(zone.to)) && Number.isFinite(zone.progress) && zone.progress >= 0 && zone.progress <= 1
  }
  return false
}

export function shelfWallIndex(wall: ShelfWall): number {
  return SHELF_WALLS.indexOf(wall)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
