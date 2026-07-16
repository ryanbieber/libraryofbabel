import { defaultAddress, SHELF_WALLS, type BookAddress } from './library'
import { isFloorIndex, isGalleryIndex } from './level'
import { isValidPlayerPose, STARTING_PLAYER_POSE, STAIR_TRAVEL_DISTANCE, type PlayerPose } from './roomGeometry'
import type { WordQuestStatus } from './significantWordQuest'
import { isValidWordFinding, type WordFinding } from './wordFinder'

export const SAVE_KEY = 'library-of-babel:save:v1'

export type SavedGameV1 = {
  version: 1
  pose: PlayerPose
  selectedBook: BookAddress
  questStatus: WordQuestStatus
  wordFinding: WordFinding | null
}

export const defaultSavedGame = (): SavedGameV1 => ({
  version: 1,
  pose: { ...STARTING_PLAYER_POSE, zone: { ...STARTING_PLAYER_POSE.zone } },
  selectedBook: { ...defaultAddress },
  questStatus: 'not-started',
  wordFinding: null,
})

export function parseSavedGame(raw: string | null): SavedGameV1 | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<SavedGameV1>
    const pose = migrateLegacyStairPose(value.pose)
    if (value.version !== 1 || !isValidPlayerPose(pose) || !isValidBookAddress(value.selectedBook) || !isQuestStatus(value.questStatus)) return null
    if (value.wordFinding !== undefined && value.wordFinding !== null && !isValidWordFinding(value.wordFinding)) return null
    return { ...value, pose, wordFinding: value.wordFinding ?? null } as SavedGameV1
  } catch {
    return null
  }
}

function migrateLegacyStairPose(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const pose = value as Record<string, unknown>
  if (!pose.zone || typeof pose.zone !== 'object') return value
  const zone = pose.zone as Record<string, unknown>
  if (zone.kind !== 'stair' || Number.isFinite(zone.distance) || !Number.isFinite(zone.progress)) return value
  const { progress, ...rest } = zone
  const fraction = Math.min(1, Math.max(0, Number(progress)))
  return { ...pose, zone: { ...rest, distance: fraction * STAIR_TRAVEL_DISTANCE } }
}

export function readSavedGame(storage: Pick<Storage, 'getItem'> = localStorage): SavedGameV1 | null {
  try {
    return parseSavedGame(storage.getItem(SAVE_KEY))
  } catch {
    return null
  }
}

export function writeSavedGame(game: SavedGameV1, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(game))
  } catch {
    // Storage can be disabled or full; the journey remains playable in memory.
  }
}

export function clearSavedGame(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  try {
    storage.removeItem(SAVE_KEY)
  } catch {
    // A failed clear is harmless; invalid or unavailable storage is ignored on read.
  }
}

function isValidBookAddress(value: unknown): value is BookAddress {
  if (!value || typeof value !== 'object') return false
  const address = value as Partial<BookAddress>
  return isFloorIndex(Number(address.floor))
    && isGalleryIndex(Number(address.gallery))
    && SHELF_WALLS.includes(address.wall as BookAddress['wall'])
    && Number.isInteger(address.shelf) && Number(address.shelf) >= 0 && Number(address.shelf) < 5
    && Number.isInteger(address.book) && Number(address.book) >= 0 && Number(address.book) < 32
}

function isQuestStatus(value: unknown): value is WordQuestStatus {
  return value === 'not-started' || value === 'accepted' || value === 'ready-to-complete' || value === 'completed'
}
