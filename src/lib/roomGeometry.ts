import {
  canMove,
  cardinalDirections,
  nextRoom,
  type DirectionIndex,
  type RoomPosition,
} from './level'
import {
  BOOKS_PER_SHELF,
  SHELVES_PER_WALL,
  WALL_COUNT,
  type BookAddress,
  nearbyBookAddress,
} from './library'

export type PlayerPose = {
  roomQ: number
  roomR: number
  x: number
  z: number
  yaw: number
}

export type MoveResult = {
  pose: PlayerPose
  crossed?: DirectionIndex
  blocked?: DirectionIndex
  door?: DirectionIndex
}

export const ROOM_HALF_SIZE = 5.4
export const PLAYER_RADIUS = 0.22
export const DOOR_HALF_WIDTH = 0.82
export const INTERACTION_RADIUS = 1.25
export const BOOK_INTERACTION_RADIUS = 1.75
export const STEP_DISTANCE = 0.74
export const WALK_SPEED = 2.75

export const STARTING_PLAYER_POSE: PlayerPose = {
  roomQ: 0,
  roomR: 0,
  x: 0,
  z: 0,
  yaw: 0,
}

const WALL_BOOK_Z_OFFSET = ROOM_HALF_SIZE - 0.18
export const SHELF_WIDTH = ROOM_HALF_SIZE * 2 - 1.34
const HALF_PI = Math.PI / 2

export function roomPositionFromPose(pose: PlayerPose): RoomPosition {
  return { q: pose.roomQ, r: pose.roomR }
}

export function normalizeYaw(yaw: number): number {
  const fullTurn = Math.PI * 2
  return ((yaw % fullTurn) + fullTurn) % fullTurn
}

export function yawToDirection(yaw: number): DirectionIndex {
  return positiveModulo(Math.round(normalizeYaw(yaw) / HALF_PI), WALL_COUNT) as DirectionIndex
}

export function directionYaw(direction: DirectionIndex): number {
  return direction * HALF_PI
}

export function movePose(pose: PlayerPose, forward: number, strafe: number, distance: number): MoveResult {
  const inputMagnitude = Math.hypot(forward, strafe)
  if (inputMagnitude === 0 || distance <= 0) {
    return { pose }
  }

  const inputScale = distance / inputMagnitude
  const dx = (Math.sin(pose.yaw) * forward + Math.cos(pose.yaw) * strafe) * inputScale
  const dz = (-Math.cos(pose.yaw) * forward + Math.sin(pose.yaw) * strafe) * inputScale

  return resolveRoomBounds(pose, pose.x + dx, pose.z + dz)
}

export function rotatePose(pose: PlayerPose, deltaYaw: number): PlayerPose {
  return {
    ...pose,
    yaw: normalizeYaw(pose.yaw + deltaYaw),
  }
}

export function booksForRoom(roomQ: number, roomR: number): BookAddress[] {
  return Array.from({ length: WALL_COUNT }, (_, wall) =>
    Array.from({ length: SHELVES_PER_WALL }, (_, shelf) =>
      Array.from({ length: BOOKS_PER_SHELF }, (_, book) =>
        nearbyBookAddress(roomQ, roomR, wall, shelf, book),
      ),
    ),
  ).flat(2)
}

export function bookWorldPosition(address: BookAddress): { x: number; z: number } {
  const offset = -SHELF_WIDTH / 2 + ((address.book + 0.5) * SHELF_WIDTH) / BOOKS_PER_SHELF

  switch (positiveModulo(address.wall, WALL_COUNT) as DirectionIndex) {
    case 0:
      return { x: offset, z: -WALL_BOOK_Z_OFFSET }
    case 1:
      return { x: WALL_BOOK_Z_OFFSET, z: offset }
    case 2:
      return { x: -offset, z: WALL_BOOK_Z_OFFSET }
    case 3:
      return { x: -WALL_BOOK_Z_OFFSET, z: -offset }
  }
}

export function distanceToBook(pose: PlayerPose, address: BookAddress): number {
  if (pose.roomQ !== address.roomQ || pose.roomR !== address.roomR) {
    return Number.POSITIVE_INFINITY
  }

  const position = bookWorldPosition(address)
  return Math.hypot(pose.x - position.x, pose.z - position.z)
}

export function isBookReachable(pose: PlayerPose, address: BookAddress): boolean {
  return distanceToBook(pose, address) <= BOOK_INTERACTION_RADIUS
}

export function doorWorldPosition(direction: DirectionIndex): { x: number; z: number } {
  const edge = ROOM_HALF_SIZE - PLAYER_RADIUS

  switch (direction) {
    case 0:
      return { x: 0, z: -edge }
    case 1:
      return { x: edge, z: 0 }
    case 2:
      return { x: 0, z: edge }
    case 3:
      return { x: -edge, z: 0 }
  }
}

export function distanceToDoor(pose: PlayerPose, direction: DirectionIndex): number {
  const position = doorWorldPosition(direction)
  return Math.hypot(pose.x - position.x, pose.z - position.z)
}

export function isDoorReachable(pose: PlayerPose, direction: DirectionIndex): boolean {
  const room = roomPositionFromPose(pose)
  if (!canMove(room, direction, 1)) {
    return false
  }

  const doorAxis = direction === 0 || direction === 2 ? pose.x : pose.z
  return Math.abs(doorAxis) <= DOOR_HALF_WIDTH + PLAYER_RADIUS && distanceToDoor(pose, direction) <= INTERACTION_RADIUS
}

export function enterDoor(pose: PlayerPose, direction: DirectionIndex): MoveResult {
  const room = roomPositionFromPose(pose)
  if (!canMove(room, direction, 1)) {
    return { pose, blocked: direction }
  }
  if (!isDoorReachable(pose, direction)) {
    return { pose, blocked: direction, door: direction }
  }

  const destination = nextRoom(room, direction, 1)
  return {
    pose: {
      ...pose,
      roomQ: destination.q,
      roomR: destination.r,
      x: entryXForDirection(direction, pose.x),
      z: entryZForDirection(direction, pose.z),
    },
    crossed: direction,
  }
}

export function poseNearBook(address: BookAddress): PlayerPose {
  const position = bookWorldPosition(address)
  const wall = positiveModulo(address.wall, WALL_COUNT) as DirectionIndex
  const inset = BOOK_INTERACTION_RADIUS * 0.58

  switch (wall) {
    case 0:
      return { roomQ: address.roomQ, roomR: address.roomR, x: position.x, z: position.z + inset, yaw: directionYaw(0) }
    case 1:
      return { roomQ: address.roomQ, roomR: address.roomR, x: position.x - inset, z: position.z, yaw: directionYaw(1) }
    case 2:
      return { roomQ: address.roomQ, roomR: address.roomR, x: position.x, z: position.z - inset, yaw: directionYaw(2) }
    case 3:
      return { roomQ: address.roomQ, roomR: address.roomR, x: position.x + inset, z: position.z, yaw: directionYaw(3) }
  }
}

function resolveRoomBounds(pose: PlayerPose, targetX: number, targetZ: number): MoveResult {
  const room = roomPositionFromPose(pose)
  const eastLimit = ROOM_HALF_SIZE - PLAYER_RADIUS
  const westLimit = -ROOM_HALF_SIZE + PLAYER_RADIUS
  const southLimit = ROOM_HALF_SIZE - PLAYER_RADIUS
  const northLimit = -ROOM_HALF_SIZE + PLAYER_RADIUS

  if (targetZ < northLimit) {
    return resolveBoundary(pose, room, targetX, targetZ, 0)
  }
  if (targetX > eastLimit) {
    return resolveBoundary(pose, room, targetX, targetZ, 1)
  }
  if (targetZ > southLimit) {
    return resolveBoundary(pose, room, targetX, targetZ, 2)
  }
  if (targetX < westLimit) {
    return resolveBoundary(pose, room, targetX, targetZ, 3)
  }

  return {
    pose: {
      ...pose,
      x: targetX,
      z: targetZ,
    },
  }
}

function resolveBoundary(
  pose: PlayerPose,
  room: RoomPosition,
  targetX: number,
  targetZ: number,
  direction: DirectionIndex,
): MoveResult {
  const doorAxis = direction === 0 || direction === 2 ? targetX : targetZ
  const isOpenableDoor = Math.abs(doorAxis) <= DOOR_HALF_WIDTH && canMove(room, direction, 1)

  return {
    pose: {
      ...pose,
      x: clampBoundaryX(direction, targetX),
      z: clampBoundaryZ(direction, targetZ),
    },
    blocked: direction,
    door: isOpenableDoor ? direction : undefined,
  }
}

function entryXForDirection(direction: DirectionIndex, targetX: number): number {
  if (direction === 1) return -ROOM_HALF_SIZE + PLAYER_RADIUS + 0.08
  if (direction === 3) return ROOM_HALF_SIZE - PLAYER_RADIUS - 0.08
  return clamp(targetX, -DOOR_HALF_WIDTH, DOOR_HALF_WIDTH)
}

function entryZForDirection(direction: DirectionIndex, targetZ: number): number {
  if (direction === 0) return ROOM_HALF_SIZE - PLAYER_RADIUS - 0.08
  if (direction === 2) return -ROOM_HALF_SIZE + PLAYER_RADIUS + 0.08
  return clamp(targetZ, -DOOR_HALF_WIDTH, DOOR_HALF_WIDTH)
}

function clampBoundaryX(direction: DirectionIndex, targetX: number): number {
  if (direction === 1) return ROOM_HALF_SIZE - PLAYER_RADIUS
  if (direction === 3) return -ROOM_HALF_SIZE + PLAYER_RADIUS
  return clamp(targetX, -ROOM_HALF_SIZE + PLAYER_RADIUS, ROOM_HALF_SIZE - PLAYER_RADIUS)
}

function clampBoundaryZ(direction: DirectionIndex, targetZ: number): number {
  if (direction === 0) return -ROOM_HALF_SIZE + PLAYER_RADIUS
  if (direction === 2) return ROOM_HALF_SIZE - PLAYER_RADIUS
  return clamp(targetZ, -ROOM_HALF_SIZE + PLAYER_RADIUS, ROOM_HALF_SIZE - PLAYER_RADIUS)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo
}

export function directionLabel(direction: DirectionIndex): string {
  return cardinalDirections[direction].label
}
