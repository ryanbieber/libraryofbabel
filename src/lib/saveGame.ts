import { defaultAddress, SHELF_WALLS, type BookAddress } from './library'
import { isFloorIndex, isGalleryIndex } from './level'
import { isValidPlayerPose, STARTING_PLAYER_POSE, type PlayerPose } from './roomGeometry'
import type { WordQuestStatus } from './significantWordQuest'

export const SAVE_KEY = 'library-of-babel:save:v1'

export type SavedGameV1 = {
  version: 1
  pose: PlayerPose
  selectedBook: BookAddress
  questStatus: WordQuestStatus
}

export const defaultSavedGame = (): SavedGameV1 => ({
  version: 1,
  pose: { ...STARTING_PLAYER_POSE, zone: { ...STARTING_PLAYER_POSE.zone } },
  selectedBook: { ...defaultAddress },
  questStatus: 'not-started',
})

export function parseSavedGame(raw: string | null): SavedGameV1 | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<SavedGameV1>
    if (value.version !== 1 || !isValidPlayerPose(value.pose) || !isValidBookAddress(value.selectedBook) || !isQuestStatus(value.questStatus)) return null
    return value as SavedGameV1
  } catch {
    return null
  }
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
  return value === 'not-started' || value === 'accepted' || value === 'completed'
}
