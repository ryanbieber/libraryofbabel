import { GALLERY_INDICES, type FloorIndex } from './level'
import {
  BOOKS_PER_SHELF,
  LINES_PER_PAGE,
  PAGES_PER_BOOK,
  SHELF_WALLS,
  SHELVES_PER_WALL,
  SYMBOLS_PER_LINE,
  generatePage,
  type PageAddress,
} from './library'

export type WordFinding = {
  word: string
  address: PageAddress
}

export type WordFinderResult =
  | { valid: true; finding: WordFinding }
  | { valid: false; message: string }

const FINDER_FLOORS: readonly FloorIndex[] = [-1, 0, 1]
const MAX_WORD_LENGTH = 32

export function findWord(rawWord: string): WordFinderResult {
  const word = rawWord.trim().toLowerCase()
  if (!word) return { valid: false, message: 'Offer the indexer one word.' }
  if (!/^[a-z]+$/.test(word)) return { valid: false, message: 'Use one word made only of the letters A-Z.' }
  if (word.length > MAX_WORD_LENGTH) return { valid: false, message: `Keep the word to ${MAX_WORD_LENGTH} letters or fewer.` }

  return {
    valid: true,
    finding: {
      word,
      address: {
        floor: FINDER_FLOORS[stableHash(`word-finder:${word}:floor`) % FINDER_FLOORS.length],
        gallery: GALLERY_INDICES[stableHash(`word-finder:${word}:gallery`) % GALLERY_INDICES.length],
        wall: SHELF_WALLS[stableHash(`word-finder:${word}:wall`) % SHELF_WALLS.length],
        shelf: stableHash(`word-finder:${word}:shelf`) % SHELVES_PER_WALL,
        book: stableHash(`word-finder:${word}:book`) % BOOKS_PER_SHELF,
        page: stableHash(`word-finder:${word}:page`) % PAGES_PER_BOOK + 1,
      },
    },
  }
}

export function generatePageWithFinding(address: PageAddress, finding: WordFinding | null): string[] {
  const lines = generatePage(address)
  if (!finding || !isFindingPage(address, finding)) return lines

  const lineIndex = stableHash(`word-finder:${finding.word}:line`) % LINES_PER_PAGE
  const availableColumns = SYMBOLS_PER_LINE - finding.word.length - 2
  const column = stableHash(`word-finder:${finding.word}:column`) % Math.max(1, availableColumns)
  const insertion = ` ${finding.word} `
  const line = lines[lineIndex]
  lines[lineIndex] = `${line.slice(0, column)}${insertion}${line.slice(column + insertion.length)}`
  return lines
}

export function isFindingPage(address: PageAddress, finding: WordFinding): boolean {
  const target = finding.address
  return address.floor === target.floor
    && address.gallery === target.gallery
    && address.wall === target.wall
    && address.shelf === target.shelf
    && address.book === target.book
    && address.page === target.page
}

export function isValidWordFinding(value: unknown): value is WordFinding {
  if (!value || typeof value !== 'object') return false
  const finding = value as Partial<WordFinding>
  if (typeof finding.word !== 'string') return false
  const result = findWord(finding.word)
  if (!result.valid || !finding.address) return false
  const expected = result.finding
  return finding.word === expected.word
    && finding.address.floor === expected.address.floor
    && finding.address.gallery === expected.address.gallery
    && finding.address.wall === expected.address.wall
    && finding.address.shelf === expected.address.shelf
    && finding.address.book === expected.address.book
    && finding.address.page === expected.address.page
}

export function wordFindingLabel(finding: WordFinding): string {
  const { floor, gallery, wall, shelf, book, page } = finding.address
  return `floor ${signed(floor)}, gallery ${signed(gallery)}, wall ${wall}, shelf ${shelf + 1}, volume ${book + 1}, page ${page}`
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}
