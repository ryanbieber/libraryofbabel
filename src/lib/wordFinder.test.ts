import { describe, expect, it } from 'vitest'
import { pageContainsWord } from './quest'
import { findWord, generatePageWithFinding, isValidWordFinding, wordFindingLabel } from './wordFinder'

describe('word finder index', () => {
  it('assigns the same word the same playable address', () => {
    const first = findWord('Labyrinth')
    const second = findWord(' labyrinth ')
    expect(first).toEqual(second)
    expect(first.valid).toBe(true)
    if (!first.valid) return
    expect(isValidWordFinding(first.finding)).toBe(true)
    expect(wordFindingLabel(first.finding)).toMatch(/floor [-+0-9]+, gallery [-+0-9]+, wall [A-D], shelf [1-5], volume ([1-9]|[12][0-9]|3[0-2]), page ([1-9]|[1-3][0-9]{2}|40[0-9]|410)/)
  })

  it('places the requested word only on its indexed page', () => {
    const result = findWord('world')
    if (!result.valid) throw new Error('Expected a valid finding')
    const targetPage = generatePageWithFinding(result.finding.address, result.finding)
    const otherPage = generatePageWithFinding({ ...result.finding.address, page: result.finding.address.page === 410 ? 409 : result.finding.address.page + 1 }, result.finding)
    expect(pageContainsWord(targetPage, 'world')).toBe(true)
    expect(pageContainsWord(otherPage, 'world')).toBe(false)
  })

  it('requires one reasonably sized alphabetic word', () => {
    expect(findWord('').valid).toBe(false)
    expect(findWord('two words').valid).toBe(false)
    expect(findWord('word!').valid).toBe(false)
    expect(findWord('a'.repeat(33)).valid).toBe(false)
  })
})
