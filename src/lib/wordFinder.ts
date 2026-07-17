import { FLOOR_INDICES, GALLERY_INDICES } from './level'
import {
  BOOKS_PER_SHELF,
  LETTER_SYMBOLS,
  PAGES_PER_BOOK,
  SHELF_WALLS,
  SHELVES_PER_WALL,
  generatePage,
  rowDisplayLabel,
  wallDisplayLabel,
  type PageAddress,
} from './library'
import { pageContainsWord } from './quest'

export type WordFinding = {
  word: string
  address: PageAddress
}

export type WordFinderResult =
  | { valid: true; finding: WordFinding }
  | { valid: false; message: string }

export const MAX_FINDER_WORD_LENGTH = 5
const SEARCH_BATCH_MS = 8
const findingCache = new Map<string, WordFinding | null>()

export async function findWord(rawWord: string): Promise<WordFinderResult> {
  const validation = validateFinderWord(rawWord)
  if (!validation.valid) return validation
  const { word } = validation
  const cached = findingCache.get(word)
  if (cached !== undefined) return cached
    ? { valid: true, finding: cached }
    : unsupportedResult(word)

  let batchStarted = now()
  for (const address of playablePageAddresses()) {
    if (pageContainsWord(generatePage(address), word)) {
      const finding = { word, address }
      findingCache.set(word, finding)
      return { valid: true, finding }
    }
    if (now() - batchStarted >= SEARCH_BATCH_MS) {
      await yieldToBrowser()
      batchStarted = now()
    }
  }

  findingCache.set(word, null)
  return unsupportedResult(word)
}

export function validateFinderWord(rawWord: string): { valid: true; word: string } | { valid: false; message: string } {
  const word = rawWord.trim().toLowerCase()
  if (!word) return { valid: false, message: 'Offer the indexer one word.' }
  if ([...word].some((symbol) => !LETTER_SYMBOLS.includes(symbol))) {
    return { valid: false, message: `Use only the Library's letters: ${LETTER_SYMBOLS}.` }
  }
  if (word.length > MAX_FINDER_WORD_LENGTH) {
    return { valid: false, message: `The present index reaches words of ${MAX_FINDER_WORD_LENGTH} letters or fewer.` }
  }
  return { valid: true, word }
}

export function isValidWordFinding(value: unknown): value is WordFinding {
  if (!value || typeof value !== 'object') return false
  const finding = value as Partial<WordFinding>
  if (typeof finding.word !== 'string') return false
  const validation = validateFinderWord(finding.word)
  if (!validation.valid || validation.word !== finding.word || !isPlayablePageAddress(finding.address)) return false
  return pageContainsWord(generatePage(finding.address), finding.word)
}

export function wordFindingLabel(finding: WordFinding): string {
  const { floor, gallery, wall, shelf, book, page } = finding.address
  return `floor ${signed(floor)}, gallery ${signed(gallery)}, wall ${wallDisplayLabel(wall)}, row ${rowDisplayLabel(shelf)} (${shelf + 1}), book ${book + 1}, page ${page}`
}

function* playablePageAddresses(): Generator<PageAddress> {
  for (const floor of FLOOR_INDICES) {
    for (const gallery of GALLERY_INDICES) {
      for (const wall of SHELF_WALLS) {
        for (let shelf = 0; shelf < SHELVES_PER_WALL; shelf += 1) {
          for (let book = 0; book < BOOKS_PER_SHELF; book += 1) {
            for (let page = 1; page <= PAGES_PER_BOOK; page += 1) {
              yield { floor, gallery, wall, shelf, book, page }
            }
          }
        }
      }
    }
  }
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function isPlayablePageAddress(value: unknown): value is PageAddress {
  if (!value || typeof value !== 'object') return false
  const address = value as Partial<PageAddress>
  return FLOOR_INDICES.includes(address.floor as PageAddress['floor'])
    && GALLERY_INDICES.includes(address.gallery as PageAddress['gallery'])
    && SHELF_WALLS.includes(address.wall as PageAddress['wall'])
    && Number.isInteger(address.shelf) && Number(address.shelf) >= 0 && Number(address.shelf) < SHELVES_PER_WALL
    && Number.isInteger(address.book) && Number(address.book) >= 0 && Number(address.book) < BOOKS_PER_SHELF
    && Number.isInteger(address.page) && Number(address.page) >= 1 && Number(address.page) <= PAGES_PER_BOOK
}

function unsupportedResult(word: string): WordFinderResult {
  return {
    valid: false,
    message: `The index finds no “${word}” in the Library's present finite sector. Its farther addresses are not yet open.`,
  }
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
