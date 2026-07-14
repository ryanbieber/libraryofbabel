import {
  ALPHABET_SIZE,
  LINES_PER_PAGE,
  SYMBOLS_PER_BOOK,
  SYMBOLS_PER_LINE,
  type BookAddress,
} from './library'

export const QUEST_TARGET_WORD = 'babel'

export type SignificantWordOdds = {
  pageChance: number
  bookChance: number
  oneInPages: number
  oneInBooks: number
}

export type SignificantWordSubmission = BookAddress & {
  page: number
}

export function pageContainsWord(lines: string[], word: string): boolean {
  const target = word.toLowerCase()
  return lines.some((line) => line.toLowerCase().includes(target))
}

export function targetWordOdds(word: string): SignificantWordOdds {
  const targetLength = Math.max(1, word.length)
  const possibleSequences = ALPHABET_SIZE ** targetLength
  const pageWindows = LINES_PER_PAGE * SYMBOLS_PER_LINE - targetLength + 1
  const bookWindows = SYMBOLS_PER_BOOK - targetLength + 1
  const pageChance = chanceAtLeastOnce(pageWindows, possibleSequences)
  const bookChance = chanceAtLeastOnce(bookWindows, possibleSequences)

  return {
    pageChance,
    bookChance,
    oneInPages: 1 / pageChance,
    oneInBooks: 1 / bookChance,
  }
}

function chanceAtLeastOnce(windows: number, possibleSequences: number): number {
  return 1 - (1 - 1 / possibleSequences) ** windows
}
