import { cardinalDirections, type DirectionIndex } from './level'
import { BOOKS_PER_SHELF, PAGES_PER_BOOK, SHELVES_PER_WALL, generatePage } from './library'
import { QUEST_TARGET_WORD, pageContainsWord, type SignificantWordSubmission } from './quest'

export type WordQuestStatus = 'not-started' | 'accepted' | 'completed'

export type WordQuestFeedback = {
  tone: 'success' | 'error'
  text: string
}

export type WordQuestFormValues = {
  room: string
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
  if (!result.valid) {
    return { feedback: { tone: 'error', text: result.message }, message: result.message }
  }

  const page = generatePage(result.submission)
  if (pageContainsWord(page, QUEST_TARGET_WORD)) {
    const location = `room ${result.display.room}, wall ${result.display.wall}, shelf ${result.display.shelf}, volume ${result.display.volume}, page ${result.display.page}`
    const text = `At last, a coordinate instead of a sermon: ${location}. The word is there. Bring your patience back for the next quest.`
    return {
      feedback: { tone: 'success', text },
      message: 'The monk accepts the book coordinates and prepares the next quest.',
      nextStatus: 'completed',
    }
  }

  const text = `No ${QUEST_TARGET_WORD} on that page. A confident heretic is still a heretic.`
  return { feedback: { tone: 'error', text }, message: text }
}

function parseSignificantWordSubmission(values: WordQuestFormValues): {
  valid: true
  submission: SignificantWordSubmission
  display: { room: string; wall: string; shelf: number; volume: number; page: number }
} | {
  valid: false
  message: string
} {
  const room = parseRoom(values.room)
  const wall = parseWall(values.wall)
  const shelf = parseInteger(values.shelf)
  const volume = parseInteger(values.volume)
  const page = parseInteger(values.page)

  if (room === null) {
    return { valid: false, message: 'Room must be two coordinates like 0,0 or -2,1.' }
  }
  if (wall === null) {
    return { valid: false, message: 'Choose a wall: north, east, south, west, or 1-4.' }
  }
  if (shelf === null || shelf < 1 || shelf > SHELVES_PER_WALL) {
    return { valid: false, message: `Shelf must be 1-${SHELVES_PER_WALL}.` }
  }
  if (volume === null || volume < 1 || volume > BOOKS_PER_SHELF) {
    return { valid: false, message: `Volume must be 1-${BOOKS_PER_SHELF}.` }
  }
  if (page === null || page < 1 || page > PAGES_PER_BOOK) {
    return { valid: false, message: `Page must be 1-${PAGES_PER_BOOK}.` }
  }

  return {
    valid: true,
    submission: {
      roomQ: room.q,
      roomR: room.r,
      wall,
      shelf: shelf - 1,
      book: volume - 1,
      page,
    },
    display: {
      room: `${room.q},${room.r}`,
      wall: cardinalDirections[wall].label,
      shelf,
      volume,
      page,
    },
  }
}

function parseRoom(value: string): { q: number; r: number } | null {
  const match = value.trim().match(/^(-?\d+)\s*,\s*(-?\d+)$/)
  if (!match) return null
  return { q: Number(match[1]), r: Number(match[2]) }
}

function parseWall(value: string): DirectionIndex | null {
  const clean = value.trim().toLowerCase()
  const numeric = parseInteger(clean)
  if (numeric !== null && numeric >= 1 && numeric <= cardinalDirections.length) {
    return (numeric - 1) as DirectionIndex
  }

  const index = cardinalDirections.findIndex((direction) => direction.label === clean || direction.shortLabel.toLowerCase() === clean)
  return index === -1 ? null : index as DirectionIndex
}

function parseInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  return Number(value)
}
