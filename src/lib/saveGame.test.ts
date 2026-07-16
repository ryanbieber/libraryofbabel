// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { clearSavedGame, defaultSavedGame, parseSavedGame, readSavedGame, writeSavedGame } from './saveGame'
import { STAIR_TRAVEL_DISTANCE } from './roomGeometry'
import { findWord } from './wordFinder'

describe('local journey save', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips the versioned pose, book, and quest status', () => {
    const game = defaultSavedGame()
    game.questStatus = 'accepted'
    const finding = findWord('labyrinth')
    if (!finding.valid) throw new Error('Expected a valid finding')
    game.wordFinding = finding.finding
    writeSavedGame(game)
    expect(readSavedGame()).toEqual(game)
  })

  it('rejects corrupt, obsolete, and out-of-range saves', () => {
    expect(parseSavedGame('{')).toBeNull()
    expect(parseSavedGame(JSON.stringify({ ...defaultSavedGame(), version: 2 }))).toBeNull()
    expect(parseSavedGame(JSON.stringify({ ...defaultSavedGame(), pose: { ...defaultSavedGame().pose, floor: 9 } }))).toBeNull()
    expect(parseSavedGame(JSON.stringify({ ...defaultSavedGame(), wordFinding: { word: 'wrong', address: defaultSavedGame().selectedBook } }))).toBeNull()
  })

  it('migrates an existing save without a word finding', () => {
    const { wordFinding: _wordFinding, ...oldSave } = defaultSavedGame()
    expect(parseSavedGame(JSON.stringify(oldSave))?.wordFinding).toBeNull()
  })

  it('migrates an in-progress stair save from percentage to track distance', () => {
    const game = defaultSavedGame()
    const legacy = {
      ...game,
      pose: {
        ...game.pose,
        zone: { kind: 'stair', connector: 0, from: 0, to: 1, progress: 0.5 },
      },
    }

    expect(parseSavedGame(JSON.stringify(legacy))?.pose.zone).toEqual({
      kind: 'stair', connector: 0, from: 0, to: 1, distance: STAIR_TRAVEL_DISTANCE / 2,
    })
  })

  it('clears a journey', () => {
    writeSavedGame(defaultSavedGame())
    clearSavedGame()
    expect(readSavedGame()).toBeNull()
  })

  it('keeps the app playable when browser storage is unavailable', () => {
    const broken = {
      getItem: () => { throw new Error('disabled') },
      setItem: () => { throw new Error('disabled') },
      removeItem: () => { throw new Error('disabled') },
    }
    expect(readSavedGame(broken)).toBeNull()
    expect(() => writeSavedGame(defaultSavedGame(), broken)).not.toThrow()
    expect(() => clearSavedGame(broken)).not.toThrow()
  })
})
