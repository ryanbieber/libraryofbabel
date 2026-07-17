import { parseCoordinate, serializeCoordinate, type Coordinate } from './coordinate'
import {
  BOOKS_PER_SHELF,
  PAGES_PER_BOOK,
  SHELVES_PER_WALL,
  generatePage,
  rowDisplayLabel,
  shelfWallFromLabel,
  wallDisplayLabel,
  type ShelfWall,
} from './library'
import { QUEST_TARGET_WORD, pageContainsWord, type SignificantWordSubmission } from './quest'

export type WordQuestStatus = 'not-started' | 'accepted' | 'ready-to-complete' | 'completed'
export type WordQuestFeedback = { tone: 'success' | 'error'; text: string }
export type WordQuestFormValues = {
  floor: string
  gallery: string
  wall: string
  shelf: string
  volume: string
  page: string
}

type SignificantWordQuestSubmissionResult = {
  feedback: WordQuestFeedback
  message: string
  nextStatus?: WordQuestStatus
}

export function resolveSignificantWordQuestSubmission(
  values: WordQuestFormValues,
  status: WordQuestStatus,
): SignificantWordQuestSubmissionResult {
  if (status === 'not-started') {
    const text = 'Accept the monk quest before testing coordinates.'
    return { feedback: { tone: 'error', text }, message: text }
  }
  const result = parseSignificantWordSubmission(values)
  if (!result.valid) return { feedback: { tone: 'error', text: result.message }, message: result.message }

  if (pageContainsWord(generatePage(result.submission), QUEST_TARGET_WORD)) {
    const { floor, gallery, wall, shelf, volume, page } = result.display
    const location = `floor ${floor}, gallery ${gallery}, wall ${wallDisplayLabel(wall)}, row ${rowDisplayLabel(shelf - 1)} (${shelf}), book ${volume}, page ${page}`
    const text = `At last, a coordinate instead of a sermon: ${location}. The word is there.`
    return {
      feedback: { tone: 'success', text },
      message: 'The coordinate is proven. Return to the monk to complete the quest.',
      nextStatus: 'ready-to-complete',
    }
  }
  const text = `No ${QUEST_TARGET_WORD} on that page. A confident heretic is still a heretic.`
  return { feedback: { tone: 'error', text }, message: text }
}

function parseSignificantWordSubmission(values: WordQuestFormValues): {
  valid: true
  submission: SignificantWordSubmission
  display: { floor: string; gallery: string; wall: ShelfWall; shelf: number; volume: number; page: number }
} | { valid: false; message: string } {
  const floor = parseSignedInteger(values.floor)
  const gallery = parseSignedInteger(values.gallery)
  const wall = parseWall(values.wall)
  const shelf = parseUnsignedInteger(values.shelf)
  const volume = parseUnsignedInteger(values.volume)
  const page = parseUnsignedInteger(values.page)

  if (floor === null) return { valid: false, message: 'Floor must be a canonical signed integer.' }
  if (gallery === null) return { valid: false, message: 'Gallery must be a canonical signed integer.' }
  if (wall === null) return { valid: false, message: 'Wall must be I-IV, A-D, or 1-4.' }
  if (shelf === null || shelf < 1 || shelf > SHELVES_PER_WALL) return { valid: false, message: `Row must be 1-${SHELVES_PER_WALL}.` }
  if (volume === null || volume < 1 || volume > BOOKS_PER_SHELF) return { valid: false, message: `Book must be 1-${BOOKS_PER_SHELF}.` }
  if (page === null || page < 1 || page > PAGES_PER_BOOK) return { valid: false, message: `Page must be 1-${PAGES_PER_BOOK}.` }

  return {
    valid: true,
    submission: { floor, gallery, wall, shelf: shelf - 1, book: volume - 1, page },
    display: { floor: serializeCoordinate(floor), gallery: serializeCoordinate(gallery), wall, shelf, volume, page },
  }
}

function parseWall(value: string): ShelfWall | null {
  return shelfWallFromLabel(value)
}

function parseSignedInteger(value: string): Coordinate | null {
  return parseCoordinate(value.trim())
}

function parseUnsignedInteger(value: string): number | null {
  return /^\d+$/.test(value.trim()) ? Number(value) : null
}
