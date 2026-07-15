import { isFloorIndex, isGalleryIndex } from './level'
import { BOOKS_PER_SHELF, PAGES_PER_BOOK, SHELF_WALLS, SHELVES_PER_WALL, type ShelfWall } from './library'
import { QUEST_TARGET_WORD, pageContainsWord, type SignificantWordSubmission } from './quest'
import { generatePageWithFinding, type WordFinding } from './wordFinder'

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
  wordFinding: WordFinding | null = null,
): SignificantWordQuestSubmissionResult {
  if (status === 'not-started') {
    const text = 'Accept the monk quest before testing coordinates.'
    return { feedback: { tone: 'error', text }, message: text }
  }
  const result = parseSignificantWordSubmission(values)
  if (!result.valid) return { feedback: { tone: 'error', text: result.message }, message: result.message }

  if (pageContainsWord(generatePageWithFinding(result.submission, wordFinding), QUEST_TARGET_WORD)) {
    const { floor, gallery, wall, shelf, volume, page } = result.display
    const location = `floor ${floor}, gallery ${gallery}, wall ${wall}, shelf ${shelf}, volume ${volume}, page ${page}`
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
  display: { floor: number; gallery: number; wall: ShelfWall; shelf: number; volume: number; page: number }
} | { valid: false; message: string } {
  const floor = parseSignedInteger(values.floor)
  const gallery = parseSignedInteger(values.gallery)
  const wall = parseWall(values.wall)
  const shelf = parseUnsignedInteger(values.shelf)
  const volume = parseUnsignedInteger(values.volume)
  const page = parseUnsignedInteger(values.page)

  if (floor === null || !isFloorIndex(floor)) return { valid: false, message: 'Floor must be -1, 0, or 1.' }
  if (gallery === null || !isGalleryIndex(gallery)) return { valid: false, message: 'Gallery must be between -2 and 2.' }
  if (wall === null) return { valid: false, message: 'Wall must be A, B, C, or D.' }
  if (shelf === null || shelf < 1 || shelf > SHELVES_PER_WALL) return { valid: false, message: `Shelf must be 1-${SHELVES_PER_WALL}.` }
  if (volume === null || volume < 1 || volume > BOOKS_PER_SHELF) return { valid: false, message: `Volume must be 1-${BOOKS_PER_SHELF}.` }
  if (page === null || page < 1 || page > PAGES_PER_BOOK) return { valid: false, message: `Page must be 1-${PAGES_PER_BOOK}.` }

  return {
    valid: true,
    submission: { floor, gallery, wall, shelf: shelf - 1, book: volume - 1, page },
    display: { floor, gallery, wall, shelf, volume, page },
  }
}

function parseWall(value: string): ShelfWall | null {
  const clean = value.trim().toUpperCase()
  const numeric = parseUnsignedInteger(clean)
  if (numeric !== null && numeric >= 1 && numeric <= SHELF_WALLS.length) return SHELF_WALLS[numeric - 1]
  return SHELF_WALLS.includes(clean as ShelfWall) ? clean as ShelfWall : null
}

function parseSignedInteger(value: string): number | null {
  return /^-?\d+$/.test(value.trim()) ? Number(value) : null
}

function parseUnsignedInteger(value: string): number | null {
  return /^\d+$/.test(value.trim()) ? Number(value) : null
}
