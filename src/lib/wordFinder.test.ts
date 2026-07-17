import { describe, expect, it } from 'vitest'
import { defaultAddress, generatePage } from './library'
import { pageContainsWord } from './quest'
import { findWord, isValidWordFinding, validateFinderWord, wordFindingLabel } from './wordFinder'

describe('word finder index', () => {
  it('returns the same first canonical match for the same word', async () => {
    const first = await findWord('Babel')
    const second = await findWord(' babel ')
    expect(first).toEqual(second)
    expect(first.valid).toBe(true)
    if (!first.valid) return
    expect(first.finding.address).toEqual({ floor: -1, gallery: -2, wall: 'A', shelf: 0, book: 11, page: 169 })
    expect(isValidWordFinding(first.finding)).toBe(true)
    expect(wordFindingLabel(first.finding)).toMatch(/floor [-+0-9]+, gallery [-+0-9]+, wall [IV]+ \([A-D]\), row [IV]+ \([1-5]\), book ([1-9]|[12][0-9]|3[0-2]), page ([1-9]|[1-3][0-9]{2}|40[0-9]|410)/)
  })

  it('does not alter any page while searching', async () => {
    const address = { ...defaultAddress, page: 12 }
    const before = generatePage(address)
    await findWord('babel')
    expect(generatePage(address)).toEqual(before)
  })

  it('locates babel on an unchanged canonical page', async () => {
    const result = await findWord('babel')
    if (!result.valid) throw new Error(result.message)
    const before = generatePage(result.finding.address)
    expect(pageContainsWord(before, 'babel')).toBe(true)
    expect(generatePage(result.finding.address)).toEqual(before)
  })

  it('rejects forbidden symbols and words beyond the finite index', async () => {
    expect(validateFinderWord('w')).toMatchObject({ valid: false })
    expect(validateFinderWord('zebra')).toMatchObject({ valid: false })
    expect(validateFinderWord('two words')).toMatchObject({ valid: false })
    expect((await findWord('word!')).valid).toBe(false)
    expect((await findWord('abcdef')).valid).toBe(false)
  })
})
