// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { clearSavedGame, defaultSavedGame, parseSavedGame, readSavedGame, writeSavedGame } from './saveGame'

describe('local journey save', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips the versioned pose, book, and quest status', () => {
    const game = defaultSavedGame()
    game.questStatus = 'accepted'
    writeSavedGame(game)
    expect(readSavedGame()).toEqual(game)
  })

  it('rejects corrupt, obsolete, and out-of-range saves', () => {
    expect(parseSavedGame('{')).toBeNull()
    expect(parseSavedGame(JSON.stringify({ ...defaultSavedGame(), version: 2 }))).toBeNull()
    expect(parseSavedGame(JSON.stringify({ ...defaultSavedGame(), pose: { ...defaultSavedGame().pose, floor: 9 } }))).toBeNull()
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
