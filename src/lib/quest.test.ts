import { describe, expect, it } from 'vitest'
import { PAGES_PER_BOOK } from './library'
import { QUEST_TARGET_WORD, pageContainsWord, targetWordOdds } from './quest'

describe('significant word quest helpers', () => {
  it('detects the target word on a submitted page', () => {
    expect(pageContainsWord(['dust and babble', 'then babel appears'], QUEST_TARGET_WORD)).toBe(true)
    expect(pageContainsWord(['dust and babble', 'then nothing appears'], QUEST_TARGET_WORD)).toBe(false)
  })

  it('estimates page and book odds for the target word', () => {
    const odds = targetWordOdds(QUEST_TARGET_WORD)

    expect(odds.pageChance).toBeCloseTo(0.0003272169)
    expect(odds.bookChance).toBeCloseTo(0.1257145872)
    expect(odds.oneInPages).toBeCloseTo(3056.077)
    expect(odds.oneInBooks).toBeCloseTo(7.955)
    expect(odds.oneInPages).toBeGreaterThan(PAGES_PER_BOOK)
  })
})
