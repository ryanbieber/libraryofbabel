import { describe, expect, it } from 'vitest'
import {
  ALPHABET_SIZE,
  ALPHABET,
  BOOK_DIMENSIONS,
  BOOKS_PER_SHELF,
  COVER_INSCRIPTION_LENGTH,
  BOOK_CONTENT_GENERATION_VERSION,
  COVER_GENERATION_VERSION,
  LINES_PER_PAGE,
  PAGES_PER_BOOK,
  SHELVES_PER_WALL,
  SYMBOLS_PER_BOOK,
  SYMBOLS_PER_LINE,
  addressLabel,
  clampPage,
  contentSeed,
  coverInscription,
  coverSeed,
  defaultAddress,
  deterministicJump,
  generatePage,
  isValidLibraryText,
  nearbyBookAddress,
  normalizeLibraryText,
  rowDisplayLabel,
  sequenceOdds,
  shelfWallFromLabel,
  wallDisplayLabel,
} from './library'
import { coordinate } from './coordinate'

describe('library constants', () => {
  it('uses the requested book dimensions and alphabet size', () => {
    expect(ALPHABET_SIZE).toBe(25)
    expect(PAGES_PER_BOOK).toBe(410)
    expect(LINES_PER_PAGE).toBe(40)
    expect(SYMBOLS_PER_LINE).toBe(80)
    expect(SYMBOLS_PER_BOOK).toBe(1_312_000)
    expect(SHELVES_PER_WALL).toBe(5)
    expect(BOOKS_PER_SHELF).toBe(32)
  })

  it('gives every addressed volume identical physical dimensions', () => {
    const addresses = [
      defaultAddress,
      nearbyBookAddress(coordinate(-1), coordinate(-2), 'D', 4, 31),
      nearbyBookAddress(coordinate(1), coordinate(2), 'B', 0, 0),
    ]

    expect(addresses.map(() => BOOK_DIMENSIONS)).toEqual([
      BOOK_DIMENSIONS,
      BOOK_DIMENSIONS,
      BOOK_DIMENSIONS,
    ])
    expect(BOOK_DIMENSIONS).toEqual({ width: 0.141, height: 0.38, depth: 0.13 })
  })

  it('wraps wall shelf and volume addresses into the Borges shelf shape', () => {
    expect(nearbyBookAddress(coordinate(0), coordinate(0), -1, -1, -1)).toEqual({
      floor: 0n,
      gallery: 0n,
      wall: 'D',
      shelf: 4,
      book: 31,
    })
    expect(nearbyBookAddress(coordinate(0), coordinate(0), 4, 5, 32)).toEqual({
      floor: 0n,
      gallery: 0n,
      wall: 'A',
      shelf: 0,
      book: 0,
    })
  })

  it('presents walls and rows as readable Roman and canonical coordinates', () => {
    expect(wallDisplayLabel('C')).toBe('III (C)')
    expect(rowDisplayLabel(1)).toBe('II')
    expect(addressLabel(defaultAddress)).toBe('floor 0 / gallery 0 / wall I (A) / row II (2) / book 8')
    expect(shelfWallFromLabel('III')).toBe('C')
    expect(shelfWallFromLabel('3')).toBe('C')
    expect(shelfWallFromLabel('c')).toBe('C')
  })
})

describe('page generation', () => {
  it('names the immutable legacy content strategy explicitly', () => {
    expect(BOOK_CONTENT_GENERATION_VERSION).toBe('legacy-v1')
  })

  it('generates the same addressed page every time', () => {
    const first = generatePage({ ...defaultAddress, page: 12 })
    const second = generatePage({ ...defaultAddress, page: 12 })

    expect(first).toEqual(second)
    expect(first).toHaveLength(40)
    expect(first.every((line) => line.length === 80)).toBe(true)
  })

  it('pins canonical content for a complete address', () => {
    expect(generatePage({ ...defaultAddress, page: 12 })[0]).toBe(
      'mgcalg bnlkpfgoicmccqqqpgvqvjubinboq,ccag deprshehemo iooovqutfvpnjogqmpimo.pmbi',
    )
  })

  it('changes output when the page changes', () => {
    const first = generatePage({ ...defaultAddress, page: 1 })
    const second = generatePage({ ...defaultAddress, page: 2 })

    expect(first).not.toEqual(second)
  })

  it('changes output across floors and galleries', () => {
    const first = generatePage({ ...defaultAddress, page: 1 })
    expect(generatePage({ ...defaultAddress, floor: coordinate(1), page: 1 })).not.toEqual(first)
    expect(generatePage({ ...defaultAddress, gallery: coordinate(1), page: 1 })).not.toEqual(first)
  })
})

describe('cover inscriptions', () => {
  it('pins the legacy-origin cover under its explicit generator version', () => {
    expect(COVER_GENERATION_VERSION).toBe('v1')
    expect(coverInscription(defaultAddress)).toBe('luqrv')
  })

  it('generates the same short inscription for the same cover seed', () => {
    expect(coverInscription(defaultAddress)).toBe(coverInscription(defaultAddress))
    expect(coverInscription(defaultAddress)).toHaveLength(COVER_INSCRIPTION_LENGTH)
  })

  it('uses only symbols from the canonical alphabet', () => {
    const addresses = Array.from({ length: BOOKS_PER_SHELF }, (_, book) => (
      nearbyBookAddress(coordinate(1), coordinate(-2), 'C', 4, book)
    ))

    expect(addresses.every((address) => (
      [...coverInscription(address)].every((symbol) => ALPHABET.includes(symbol))
    ))).toBe(true)
  })

  it('keeps cover and interior generation on separate domain paths', () => {
    const pageAddress = { ...defaultAddress, page: 12 }
    const nextPageAddress = { ...defaultAddress, page: 13 }

    expect(coverSeed(defaultAddress)).not.toBe(contentSeed(pageAddress, 0))
    expect(coverSeed(defaultAddress)).toContain('cover-inscription:v1:')
    expect(contentSeed(pageAddress, 0)).not.toContain('cover-inscription')
    expect(coverInscription(pageAddress)).toBe(coverInscription(nextPageAddress))
    expect(generatePage(pageAddress)).not.toEqual(generatePage(nextPageAddress))
  })
})

describe('input handling', () => {
  it('clamps page values into the book', () => {
    expect(clampPage(-10)).toBe(1)
    expect(clampPage(9999)).toBe(410)
    expect(clampPage(12.4)).toBe(12)
  })

  it('validates and normalizes the 25-symbol alphabet', () => {
    expect(isValidLibraryText('abc uv,.')).toBe(true)
    expect(isValidLibraryText('w')).toBe(false)
    expect(normalizeLibraryText('Babel W!')).toBe('babel ')
  })

  it('estimates sequence odds from valid symbols', () => {
    const odds = sequenceOdds('babel')

    expect(odds.clean).toBe('babel')
    expect(odds.isValid).toBe(true)
    expect(odds.log10Books).toBeGreaterThan(0)
  })

  it('jumps deterministically for the same seed', () => {
    expect(deterministicJump('same place')).toEqual(deterministicJump('same place'))
  })
})
