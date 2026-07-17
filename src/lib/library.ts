import { GALLERY_INDICES, type FloorIndex, type GalleryIndex } from './level'

export const LETTER_SYMBOLS = 'abcdefghijklmnopqrstuv'
export const ALPHABET = `${LETTER_SYMBOLS} ,.` as const
export const ALPHABET_SIZE = ALPHABET.length
export const PAGES_PER_BOOK = 410
export const LINES_PER_PAGE = 40
export const SYMBOLS_PER_LINE = 80
export const SYMBOLS_PER_PAGE = LINES_PER_PAGE * SYMBOLS_PER_LINE
export const SYMBOLS_PER_BOOK = PAGES_PER_BOOK * SYMBOLS_PER_PAGE
export const WALL_COUNT = 4
export const SHELVES_PER_WALL = 5
export const BOOKS_PER_SHELF = 32
export const COVER_INSCRIPTION_LENGTH = 5

export const BOOK_DIMENSIONS = Object.freeze({
  width: 0.141,
  height: 0.38,
  depth: 0.13,
})

export const SHELF_WALLS = ['A', 'B', 'C', 'D'] as const
export type ShelfWall = (typeof SHELF_WALLS)[number]

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V'] as const

export type BookAddress = {
  floor: FloorIndex
  gallery: GalleryIndex
  wall: ShelfWall
  shelf: number
  book: number
}

export type PageAddress = BookAddress & { page: number }

export const defaultAddress: BookAddress = {
  floor: 0,
  gallery: 0,
  wall: 'A',
  shelf: 1,
  book: 7,
}

export function addressKey(address: BookAddress): string {
  return `${address.floor}:${address.gallery}:${address.wall}:${address.shelf}:${address.book}`
}

export function addressLabel(address: BookAddress): string {
  return `floor ${signedLabel(address.floor)} / gallery ${signedLabel(address.gallery)} / wall ${wallDisplayLabel(address.wall)} / row ${rowDisplayLabel(address.shelf)} (${address.shelf + 1}) / book ${address.book + 1}`
}

export function romanNumeral(value: number): string {
  return ROMAN_NUMERALS[value - 1] ?? String(value)
}

export function wallDisplayLabel(wall: ShelfWall): string {
  return `${romanNumeral(SHELF_WALLS.indexOf(wall) + 1)} (${wall})`
}

export function rowDisplayLabel(shelf: number): string {
  return romanNumeral(shelf + 1)
}

export function shelfWallFromLabel(value: string): ShelfWall | null {
  const clean = value.trim().toUpperCase()
  const letterIndex = SHELF_WALLS.indexOf(clean as ShelfWall)
  if (letterIndex >= 0) return SHELF_WALLS[letterIndex]
  const romanIndex = ROMAN_NUMERALS.indexOf(clean as (typeof ROMAN_NUMERALS)[number])
  if (romanIndex >= 0 && romanIndex < SHELF_WALLS.length) return SHELF_WALLS[romanIndex]
  if (/^\d+$/.test(clean)) {
    const numericIndex = Number(clean) - 1
    if (numericIndex >= 0 && numericIndex < SHELF_WALLS.length) return SHELF_WALLS[numericIndex]
  }
  return null
}

export function clampPage(page: number): number {
  if (!Number.isFinite(page)) return 1
  return Math.min(PAGES_PER_BOOK, Math.max(1, Math.round(page)))
}

export function isValidLibraryText(value: string): boolean {
  return [...value.toLowerCase()].every((symbol) => ALPHABET.includes(symbol))
}

export function normalizeLibraryText(value: string): string {
  return [...value.toLowerCase()].filter((symbol) => ALPHABET.includes(symbol)).join('')
}

export function generatePage(address: PageAddress): string[] {
  const page = clampPage(address.page)
  return Array.from({ length: LINES_PER_PAGE }, (_, lineIndex) => generateLine({ ...address, page }, lineIndex))
}

/**
 * Cover marks deliberately use a separate, domain-specific seed from page
 * generation. They identify a binding visually, but carry no address or
 * content information a reader can decode.
 */
export function coverSeed(address: BookAddress): string {
  return `cover-inscription:v1:${addressKey(address)}`
}

export function contentSeed(address: PageAddress, lineIndex: number): string {
  const page = clampPage(address.page)
  const safeLine = Math.min(LINES_PER_PAGE - 1, Math.max(0, Math.round(lineIndex)))
  return `${addressKey(address)}:${page}:${safeLine}`
}

export function coverInscription(address: BookAddress): string {
  let state = fnv1a(coverSeed(address))
  return Array.from({ length: COVER_INSCRIPTION_LENGTH }, () => {
    state = nextRandom(state)
    return LETTER_SYMBOLS[state % LETTER_SYMBOLS.length]
  }).join('')
}

export function generateLine(address: PageAddress, lineIndex: number): string {
  let state = fnv1a(contentSeed(address, lineIndex))
  return Array.from({ length: SYMBOLS_PER_LINE }, () => {
    state = nextRandom(state)
    return ALPHABET[state % ALPHABET_SIZE]
  }).join('')
}

export function nearbyBookAddress(
  floor: FloorIndex,
  gallery: GalleryIndex,
  wall: number | ShelfWall,
  shelf: number,
  book: number,
): BookAddress {
  const wallIndex = typeof wall === 'number' ? wall : SHELF_WALLS.indexOf(wall)
  return {
    floor,
    gallery,
    wall: SHELF_WALLS[positiveModulo(wallIndex, WALL_COUNT)],
    shelf: positiveModulo(shelf, SHELVES_PER_WALL),
    book: positiveModulo(book, BOOKS_PER_SHELF),
  }
}

export function deterministicJump(seed: string): BookAddress {
  const floor = ([-1, 0, 1] as const)[hashToIndex(`${seed}:floor`) % 3]
  const gallery = GALLERY_INDICES[hashToIndex(`${seed}:gallery`) % GALLERY_INDICES.length]
  return nearbyBookAddress(
    floor,
    gallery,
    hashToIndex(`${seed}:wall`) % WALL_COUNT,
    hashToIndex(`${seed}:shelf`) % SHELVES_PER_WALL,
    hashToIndex(`${seed}:book`) % BOOKS_PER_SHELF,
  )
}

export function sequenceOdds(value: string): {
  clean: string
  isValid: boolean
  log10Books: number
  oneInLabel: string
} {
  const clean = normalizeLibraryText(value)
  const isValid = value.length > 0 && clean.length === value.toLowerCase().length
  if (clean.length === 0) {
    return { clean, isValid: false, log10Books: 0, oneInLabel: 'enter symbols from the 25-symbol alphabet' }
  }
  const windows = Math.max(1, SYMBOLS_PER_BOOK - clean.length + 1)
  const log10Books = clean.length * Math.log10(ALPHABET_SIZE) - Math.log10(windows)
  const exponent = Math.max(0, Math.ceil(log10Books))
  return {
    clean,
    isValid,
    log10Books,
    oneInLabel: exponent === 0 ? 'roughly every book' : `about 1 in 10^${exponent} books`,
  }
}

export function possibleBooksExponent(): number {
  return SYMBOLS_PER_BOOK * Math.log10(ALPHABET_SIZE)
}

function signedLabel(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function hashToIndex(input: string): number {
  return fnv1a(input) % ALPHABET_SIZE
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function nextRandom(value: number): number {
  let next = value
  next ^= next << 13
  next ^= next >>> 17
  next ^= next << 5
  return next >>> 0
}
