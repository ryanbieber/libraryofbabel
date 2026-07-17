import {
  coordinateFromLegacyNumber,
  parseCoordinate,
  serializeCoordinate,
  type Coordinate,
} from './coordinate'
import { defaultAddress, SHELF_WALLS, type BookAddress, type PageAddress } from './library'
import { isValidPlayerPose, STARTING_PLAYER_POSE, STAIR_TRAVEL_DISTANCE, type PlayerPose } from './roomGeometry'
import type { WordQuestStatus } from './significantWordQuest'
import { isValidWordFinding, type WordFinding } from './wordFinder'

export const SAVE_KEY = 'library-of-babel:save:v2'
export const LEGACY_SAVE_KEY = 'library-of-babel:save:v1'

export type SavedGameV2 = {
  version: 2
  pose: PlayerPose
  selectedBook: BookAddress
  questStatus: WordQuestStatus
  wordFinding: WordFinding | null
}

export const defaultSavedGame = (): SavedGameV2 => ({
  version: 2,
  pose: { ...STARTING_PLAYER_POSE, zone: { ...STARTING_PLAYER_POSE.zone } },
  selectedBook: { ...defaultAddress },
  questStatus: 'not-started',
  wordFinding: null,
})

export function parseSavedGame(raw: string | null): SavedGameV2 | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    return value.version === 2 ? parseV2(value) : value.version === 1 ? migrateV1(value) : null
  } catch {
    return null
  }
}

export function readSavedGame(storage: Pick<Storage, 'getItem'> = localStorage): SavedGameV2 | null {
  try {
    return parseSavedGame(storage.getItem(SAVE_KEY)) ?? parseSavedGame(storage.getItem(LEGACY_SAVE_KEY))
  } catch {
    return null
  }
}

export function writeSavedGame(game: SavedGameV2, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(serializeGame(game)))
  } catch {
    // Storage can be disabled or full; the journey remains playable in memory.
  }
}

export function clearSavedGame(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  try {
    storage.removeItem(SAVE_KEY)
    storage.removeItem(LEGACY_SAVE_KEY)
  } catch {
    // A failed clear is harmless; invalid or unavailable storage is ignored on read.
  }
}

function parseV2(value: Record<string, unknown>): SavedGameV2 | null {
  const pose = parseV2Pose(value.pose)
  const selectedBook = parseV2BookAddress(value.selectedBook)
  const wordFinding = parseV2WordFinding(value.wordFinding)
  if (!pose || !selectedBook || !isQuestStatus(value.questStatus) || wordFinding === undefined) return null
  return { version: 2, pose, selectedBook, questStatus: value.questStatus, wordFinding }
}

function migrateV1(value: Record<string, unknown>): SavedGameV2 | null {
  const pose = migrateV1Pose(migrateLegacyStairPose(value.pose))
  const selectedBook = migrateV1BookAddress(value.selectedBook)
  const wordFinding = migrateV1WordFinding(value.wordFinding)
  if (!pose || !selectedBook || !isQuestStatus(value.questStatus) || wordFinding === undefined) return null
  return { version: 2, pose, selectedBook, questStatus: value.questStatus, wordFinding }
}

function parseV2Pose(value: unknown): PlayerPose | null {
  return convertPose(value, parseCoordinate)
}

function migrateV1Pose(value: unknown): PlayerPose | null {
  return convertPose(value, coordinateFromLegacyNumber)
}

function convertPose(value: unknown, parse: (value: unknown) => Coordinate | null): PlayerPose | null {
  if (!isRecord(value)) return null
  const floor = parse(value.floor)
  const zone = value.zone
  if (floor === null || !isRecord(zone) || typeof zone.kind !== 'string') return null

  let convertedZone: PlayerPose['zone'] | null = null
  if (zone.kind === 'gallery') {
    const gallery = parse(zone.gallery)
    if (gallery !== null) convertedZone = { kind: 'gallery', gallery }
  } else if (zone.kind === 'vestibule') {
    const connector = parse(zone.connector)
    if (connector !== null) convertedZone = { kind: 'vestibule', connector }
  } else if (zone.kind === 'service') {
    const connector = parse(zone.connector)
    if (connector !== null && (zone.room === 'sleeping' || zone.room === 'latrine')) {
      convertedZone = { kind: 'service', connector, room: zone.room }
    }
  } else if (zone.kind === 'stair') {
    const connector = parse(zone.connector)
    const from = parse(zone.from)
    const to = parse(zone.to)
    if (connector !== null && from !== null && to !== null && typeof zone.distance === 'number') {
      convertedZone = { kind: 'stair', connector, from, to, distance: zone.distance }
    }
  }

  if (!convertedZone) return null
  const pose: PlayerPose = {
    floor,
    zone: convertedZone,
    x: Number(value.x),
    y: Number(value.y),
    z: Number(value.z),
    yaw: Number(value.yaw),
  }
  return isValidPlayerPose(pose) ? pose : null
}

function parseV2BookAddress(value: unknown): BookAddress | null {
  return convertBookAddress(value, parseCoordinate)
}

function migrateV1BookAddress(value: unknown): BookAddress | null {
  return convertBookAddress(value, coordinateFromLegacyNumber)
}

function convertBookAddress(value: unknown, parse: (value: unknown) => Coordinate | null): BookAddress | null {
  if (!isRecord(value)) return null
  const floor = parse(value.floor)
  const gallery = parse(value.gallery)
  if (floor === null || gallery === null
    || !SHELF_WALLS.includes(value.wall as BookAddress['wall'])
    || !Number.isInteger(value.shelf) || Number(value.shelf) < 0 || Number(value.shelf) >= 5
    || !Number.isInteger(value.book) || Number(value.book) < 0 || Number(value.book) >= 32) return null
  return { floor, gallery, wall: value.wall as BookAddress['wall'], shelf: Number(value.shelf), book: Number(value.book) }
}

function parseV2WordFinding(value: unknown): WordFinding | null | undefined {
  return convertWordFinding(value, parseV2BookAddress)
}

function migrateV1WordFinding(value: unknown): WordFinding | null | undefined {
  return convertWordFinding(value, migrateV1BookAddress)
}

function convertWordFinding(
  value: unknown,
  parseAddress: (value: unknown) => BookAddress | null,
): WordFinding | null | undefined {
  if (value === null || value === undefined) return null
  if (!isRecord(value) || typeof value.word !== 'string' || !isRecord(value.address)) return undefined
  const base = parseAddress(value.address)
  if (!base || !Number.isInteger(value.address.page)) return undefined
  const finding = { word: value.word, address: { ...base, page: Number(value.address.page) } }
  return isValidWordFinding(finding) ? finding : undefined
}

function serializeGame(game: SavedGameV2): unknown {
  return {
    version: 2,
    pose: serializePose(game.pose),
    selectedBook: serializeBookAddress(game.selectedBook),
    questStatus: game.questStatus,
    wordFinding: game.wordFinding ? {
      word: game.wordFinding.word,
      address: serializePageAddress(game.wordFinding.address),
    } : null,
  }
}

function serializePose(pose: PlayerPose): unknown {
  const base = { floor: serializeCoordinate(pose.floor), x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw }
  const zone = pose.zone
  if (zone.kind === 'gallery') return { ...base, zone: { kind: zone.kind, gallery: serializeCoordinate(zone.gallery) } }
  if (zone.kind === 'vestibule') return { ...base, zone: { kind: zone.kind, connector: serializeCoordinate(zone.connector) } }
  if (zone.kind === 'service') return { ...base, zone: { kind: zone.kind, connector: serializeCoordinate(zone.connector), room: zone.room } }
  return {
    ...base,
    zone: {
      kind: zone.kind,
      connector: serializeCoordinate(zone.connector),
      from: serializeCoordinate(zone.from),
      to: serializeCoordinate(zone.to),
      distance: zone.distance,
    },
  }
}

function serializeBookAddress(address: BookAddress): unknown {
  return {
    floor: serializeCoordinate(address.floor),
    gallery: serializeCoordinate(address.gallery),
    wall: address.wall,
    shelf: address.shelf,
    book: address.book,
  }
}

function serializePageAddress(address: PageAddress): unknown {
  return { ...serializeBookAddress(address) as object, page: address.page }
}

function migrateLegacyStairPose(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.zone)) return value
  const zone = value.zone
  if (zone.kind !== 'stair' || Number.isFinite(zone.distance) || !Number.isFinite(zone.progress)) return value
  const { progress, ...rest } = zone
  const fraction = Math.min(1, Math.max(0, Number(progress)))
  return { ...value, zone: { ...rest, distance: fraction * STAIR_TRAVEL_DISTANCE } }
}

function isQuestStatus(value: unknown): value is WordQuestStatus {
  return value === 'not-started' || value === 'accepted' || value === 'ready-to-complete' || value === 'completed'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}
