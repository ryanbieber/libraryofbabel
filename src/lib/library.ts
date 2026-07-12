export const LETTER_SYMBOLS = 'abcdefghijklmnopqrstuv'
export const ALPHABET = `${LETTER_SYMBOLS} ,.` as const
export const ALPHABET_SIZE = ALPHABET.length
export const PAGES_PER_BOOK = 410
export const LINES_PER_PAGE = 40
export const SYMBOLS_PER_LINE = 80
export const SYMBOLS_PER_PAGE = LINES_PER_PAGE * SYMBOLS_PER_LINE
export const SYMBOLS_PER_BOOK = PAGES_PER_BOOK * SYMBOLS_PER_PAGE
export const WALL_COUNT = 4

const wallLabels = ['north', 'east', 'south', 'west'] as const

export type BookAddress = {
  roomQ: number
  roomR: number
  wall: number
  shelf: number
  book: number
}

export type PageAddress = BookAddress & {
  page: number
}

export const defaultAddress: BookAddress = {
  roomQ: 0,
  roomR: 0,
  wall: 0,
  shelf: 1,
  book: 7,
}

export function addressKey(address: BookAddress): string {
  return `${address.roomQ}:${address.roomR}:${address.wall}:${address.shelf}:${address.book}`
}

export function addressLabel(address: BookAddress): string {
  return `room ${address.roomQ},${address.roomR} / ${wallLabels[positiveModulo(address.wall, WALL_COUNT)]} wall / shelf ${address.shelf + 1} / volume ${address.book + 1}`
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
  return Array.from({ length: LINES_PER_PAGE }, (_, lineIndex) =>
    generateLine({ ...address, page }, lineIndex),
  )
}

export function generateLine(address: PageAddress, lineIndex: number): string {
  const page = clampPage(address.page)
  const safeLine = Math.min(LINES_PER_PAGE - 1, Math.max(0, Math.round(lineIndex)))
  const baseOffset = (page - 1) * SYMBOLS_PER_PAGE + safeLine * SYMBOLS_PER_LINE

  return Array.from({ length: SYMBOLS_PER_LINE }, (_, charIndex) => {
    const value = hashToIndex(`${addressKey(address)}:${page}:${baseOffset + charIndex}`)
    return ALPHABET[value]
  }).join('')
}

export function nearbyBookAddress(
  roomQ: number,
  roomR: number,
  wall: number,
  shelf: number,
  book: number,
): BookAddress {
  return {
    roomQ,
    roomR,
    wall: positiveModulo(wall, WALL_COUNT),
    shelf: positiveModulo(shelf, 5),
    book: positiveModulo(book, 18),
  }
}

export function deterministicJump(seed: string): BookAddress {
  const q = signedHash(`${seed}:q`, 4800)
  const r = signedHash(`${seed}:r`, 4800)
  return nearbyBookAddress(q, r, hashToIndex(`${seed}:wall`) % WALL_COUNT, hashToIndex(`${seed}:shelf`) % 5, hashToIndex(`${seed}:book`) % 18)
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

function hashToIndex(input: string): number {
  return fnv1a(input) % ALPHABET_SIZE
}

function signedHash(input: string, spread: number): number {
  return (fnv1a(input) % (spread * 2 + 1)) - spread
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
