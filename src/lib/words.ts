import { LETTER_SYMBOLS, isValidLibraryText } from './library'

export type HighlightSegment = {
  text: string
  highlight: boolean
}

const commonEnglishWords = [
  'able', 'about', 'above', 'act', 'add', 'after', 'again', 'air', 'all', 'also', 'always',
  'am', 'an', 'and', 'animal', 'another', 'answer', 'any', 'are', 'area', 'around', 'art',
  'ask', 'at', 'back', 'ball', 'base', 'be', 'bear', 'beauty', 'because', 'bed', 'been',
  'before', 'began', 'begin', 'being', 'below', 'best', 'better', 'between', 'big', 'bird',
  'black', 'body', 'book', 'both', 'box', 'boy', 'bring', 'build', 'but', 'call', 'came',
  'can', 'car', 'care', 'carry', 'case', 'change', 'city', 'class', 'clear', 'close', 'cold',
  'color', 'come', 'common', 'complete', 'course', 'cut', 'dark', 'day', 'deep', 'develop',
  'did', 'different', 'door', 'down', 'draw', 'during', 'each', 'early', 'earth', 'ease',
  'east', 'eat', 'end', 'enough', 'even', 'ever', 'every', 'example', 'eye', 'face', 'fact',
  'fall', 'family', 'far', 'farm', 'fast', 'father', 'feel', 'feet', 'few', 'field', 'find',
  'fine', 'fire', 'first', 'fish', 'five', 'floor', 'follow', 'food', 'for', 'form', 'found',
  'four', 'friend', 'from', 'front', 'full', 'game', 'gave', 'get', 'girl', 'give', 'go',
  'good', 'got', 'great', 'green', 'group', 'grow', 'had', 'half', 'hand', 'hard', 'has',
  'have', 'head', 'hear', 'heart', 'help', 'her', 'here', 'high', 'him', 'his', 'hold',
  'home', 'horse', 'hot', 'hour', 'house', 'idea', 'important', 'in', 'interest', 'is',
  'just', 'keep', 'kind', 'king', 'knew', 'know', 'land', 'large', 'last', 'late', 'learn',
  'leave', 'left', 'less', 'let', 'letter', 'life', 'light', 'line', 'list', 'little', 'live',
  'long', 'look', 'love', 'low', 'made', 'make', 'man', 'many', 'mark', 'may', 'mean',
  'men', 'mile', 'mind', 'miss', 'more', 'most', 'mother', 'move', 'much', 'music', 'must',
  'name', 'near', 'need', 'never', 'next', 'night', 'north', 'not', 'note', 'number', 'off',
  'old', 'once', 'one', 'only', 'open', 'order', 'other', 'our', 'out', 'over', 'own',
  'page', 'paper', 'part', 'pass', 'people', 'place', 'plain', 'plant', 'play', 'point',
  'port', 'press', 'problem', 'pull', 'put', 'read', 'real', 'right', 'river', 'room', 'run',
  'same', 'saw', 'say', 'school', 'sea', 'second', 'see', 'seem', 'self', 'sentence', 'set',
  'several', 'shall', 'shape', 'she', 'short', 'side', 'simple', 'small', 'song', 'soon',
  'sound', 'south', 'spell', 'stand', 'star', 'start', 'state', 'still', 'stop', 'story',
  'study', 'such', 'sure', 'table', 'take', 'talk', 'tell', 'ten', 'than', 'that', 'the',
  'their', 'them', 'then', 'there', 'these', 'thing', 'think', 'this', 'those', 'three',
  'through', 'time', 'together', 'told', 'too', 'took', 'tree', 'true', 'try', 'turn', 'under',
  'until', 'up', 'upon', 'us', 'use', 'very', 'voice', 'vowel', 'walk', 'want', 'warm',
  'was', 'watch', 'water', 'way', 'well', 'went', 'were', 'west', 'what', 'when', 'where',
  'which', 'while', 'white', 'who', 'why', 'will', 'wind', 'with', 'without', 'word', 'work',
  'world', 'would', 'write', 'year',
]

const wordSet = new Set(
  commonEnglishWords.filter((word) => word.length >= 3 && isPossibleWord(word)),
)
const wordLengths = [...new Set([...wordSet].map((word) => word.length))].sort((a, b) => b - a)
const letterSet = new Set([...LETTER_SYMBOLS])

export function highlightEnglishWords(line: string): HighlightSegment[] {
  const segments: HighlightSegment[] = []
  let plain = ''
  let index = 0

  while (index < line.length) {
    const match = longestWordAt(line, index)
    if (match) {
      if (plain) {
        segments.push({ text: plain, highlight: false })
        plain = ''
      }
      segments.push({ text: match, highlight: true })
      index += match.length
      continue
    }

    plain += line[index]
    index += 1
  }

  if (plain) {
    segments.push({ text: plain, highlight: false })
  }

  return segments
}

export function highlightPage(lines: string[]): HighlightSegment[][] {
  return lines.map(highlightEnglishWords)
}

function longestWordAt(line: string, index: number): string | null {
  if (!letterSet.has(line[index])) {
    return null
  }

  for (const length of wordLengths) {
    const candidate = line.slice(index, index + length)
    if (candidate.length === length && wordSet.has(candidate)) {
      return candidate
    }
  }

  return null
}

function isPossibleWord(word: string): boolean {
  return [...word].every((symbol) => LETTER_SYMBOLS.includes(symbol)) && isValidLibraryText(word)
}
