import { describe, expect, it } from 'vitest'
import { highlightEnglishWords } from './words'

describe('english word highlighting', () => {
  it('highlights common possible English words inside library text', () => {
    expect(highlightEnglishWords('zzthe..book').filter((segment) => segment.highlight).map((segment) => segment.text)).toEqual([
      'the',
      'book',
    ])
  })

  it('prefers the longest non-overlapping match', () => {
    expect(highlightEnglishWords('there').filter((segment) => segment.highlight).map((segment) => segment.text)).toEqual([
      'there',
    ])
  })

  it('leaves impossible alphabet words unhighlighted', () => {
    expect(highlightEnglishWords('year world').some((segment) => segment.highlight)).toBe(false)
  })

  it('highlights an indexed word even when it uses letters outside the base alphabet', () => {
    expect(highlightEnglishWords('dust world dust', 'world').filter((segment) => segment.highlight).map((segment) => segment.text)).toContain('world')
  })
})
