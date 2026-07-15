import { describe, expect, it } from 'vitest'
import {
  ALPHABET_SIZE,
  BOOKS_PER_SHELF,
  LINES_PER_PAGE,
  PAGES_PER_BOOK,
  SHELVES_PER_WALL,
  SYMBOLS_PER_BOOK,
  SYMBOLS_PER_LINE,
  clampPage,
  defaultAddress,
  deterministicJump,
  generatePage,
  isValidLibraryText,
  nearbyBookAddress,
  normalizeLibraryText,
  sequenceOdds,
} from './library'

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

  it('wraps wall shelf and volume addresses into the Borges shelf shape', () => {
    expect(nearbyBookAddress(0, 0, -1, -1, -1)).toEqual({
      floor: 0,
      gallery: 0,
      wall: 'D',
      shelf: 4,
      book: 31,
    })
    expect(nearbyBookAddress(0, 0, 4, 5, 32)).toEqual({
      floor: 0,
      gallery: 0,
      wall: 'A',
      shelf: 0,
      book: 0,
    })
  })
})

describe('page generation', () => {
  it('generates the same addressed page every time', () => {
    const first = generatePage({ ...defaultAddress, page: 12 })
    const second = generatePage({ ...defaultAddress, page: 12 })

    expect(first).toEqual(second)
    expect(first).toHaveLength(40)
    expect(first[0]).toHaveLength(80)
  })

  it('changes output when the page changes', () => {
    const first = generatePage({ ...defaultAddress, page: 1 })
    const second = generatePage({ ...defaultAddress, page: 2 })

    expect(first).not.toEqual(second)
  })

  it('changes output across floors and galleries', () => {
    const first = generatePage({ ...defaultAddress, page: 1 })
    expect(generatePage({ ...defaultAddress, floor: 1, page: 1 })).not.toEqual(first)
    expect(generatePage({ ...defaultAddress, gallery: 1, page: 1 })).not.toEqual(first)
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
