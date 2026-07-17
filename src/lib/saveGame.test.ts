// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { coordinate } from './coordinate'
import { incidentForGallery } from './incidents'
import { generatePage } from './library'
import { STAIR_TRAVEL_DISTANCE } from './roomGeometry'
import {
  LEGACY_SAVE_KEY,
  SAVE_KEY,
  clearSavedGame,
  defaultSavedGame,
  parseSavedGame,
  readSavedGame,
  writeSavedGame,
} from './saveGame'
import { findWord } from './wordFinder'

describe('versioned local journey save', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips v2 decimal coordinates far beyond safe integers', async () => {
    const game = defaultSavedGame()
    game.questStatus = 'accepted'
    game.pose.floor = coordinate('999999999999999999999999999999')
    game.pose.zone = { kind: 'gallery', gallery: coordinate('-888888888888888888888888888888') }
    game.selectedBook = { ...game.selectedBook, floor: game.pose.floor, gallery: game.pose.zone.gallery }
    const finding = await findWord('babel')
    if (!finding.valid) throw new Error('Expected a valid finding')
    game.wordFinding = finding.finding

    writeSavedGame(game)
    expect(readSavedGame()).toEqual(game)
    const persisted = localStorage.getItem(SAVE_KEY) ?? ''
    expect(persisted).toContain('"floor":"999999999999999999999999999999"')
    expect(() => JSON.parse(persisted)).not.toThrow()
  })

  it('migrates a v1 save without losing location, quest, selected book, or finding', async () => {
    const finding = await findWord('babel')
    if (!finding.valid) throw new Error('Expected a valid finding')
    const legacy = legacySave({
      questStatus: 'ready-to-complete',
      pose: { floor: -1, zone: { kind: 'gallery', gallery: 2 }, x: 1, y: 0, z: -3, yaw: 1.25 },
      selectedBook: { floor: 1, gallery: -2, wall: 'D', shelf: 4, book: 31 },
      wordFinding: {
        word: finding.finding.word,
        address: {
          ...finding.finding.address,
          floor: Number(finding.finding.address.floor),
          gallery: Number(finding.finding.address.gallery),
        },
      },
    })

    localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify(legacy))
    expect(readSavedGame()).toEqual({
      version: 2,
      questStatus: 'ready-to-complete',
      pose: { floor: -1n, zone: { kind: 'gallery', gallery: 2n }, x: 1, y: 0, z: -3, yaw: 1.25 },
      selectedBook: { floor: 1n, gallery: -2n, wall: 'D', shelf: 4, book: 31 },
      wordFinding: finding.finding,
    })
  })

  it('migrates an in-progress v1 stair percentage to track distance', () => {
    const legacy = legacySave({
      pose: {
        floor: 0,
        zone: { kind: 'stair', connector: 0, from: 0, to: 1, progress: 0.5 },
        x: 0, y: 0, z: 0, yaw: 0,
      },
    })

    expect(parseSavedGame(JSON.stringify(legacy))?.pose.zone).toEqual({
      kind: 'stair', connector: 0n, from: 0n, to: 1n, distance: STAIR_TRAVEL_DISTANCE / 2,
    })
  })

  it('rejects malformed, unsafe, noncanonical, and inconsistent saves', () => {
    expect(parseSavedGame('{')).toBeNull()
    expect(parseSavedGame(JSON.stringify({ ...legacySave(), version: 3 }))).toBeNull()
    expect(parseSavedGame(JSON.stringify(legacySave({
      pose: { floor: Number.MAX_SAFE_INTEGER + 1, zone: { kind: 'gallery', gallery: 0 }, x: 0, y: 0, z: 0, yaw: 0 },
    })))).toBeNull()

    const validV2 = JSON.parse(v2Json())
    expect(parseSavedGame(JSON.stringify({ ...validV2, pose: { ...validV2.pose, floor: '01' } }))).toBeNull()
    expect(parseSavedGame(JSON.stringify({
      ...validV2,
      pose: { ...validV2.pose, zone: { kind: 'stair', connector: '0', from: '0', to: '2', distance: 1 } },
    }))).toBeNull()
  })

  it('keeps incident derivation out of serialized journey state', () => {
    writeSavedGame(defaultSavedGame())
    const before = localStorage.getItem(SAVE_KEY)
    incidentForGallery(coordinate(1), coordinate(2))
    expect(localStorage.getItem(SAVE_KEY)).toBe(before)
  })

  it('clears both save generations', () => {
    writeSavedGame(defaultSavedGame())
    localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify(legacySave()))
    clearSavedGame()
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
    expect(localStorage.getItem(LEGACY_SAVE_KEY)).toBeNull()
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

  it('preserves the selected legacy book page through migration', () => {
    const legacy = legacySave({ selectedBook: { floor: -1, gallery: 2, wall: 'B', shelf: 3, book: 17 } })
    const migrated = parseSavedGame(JSON.stringify(legacy))
    if (!migrated) throw new Error('Expected migration')
    const expected = generatePage({ floor: coordinate(-1), gallery: coordinate(2), wall: 'B', shelf: 3, book: 17, page: 12 })
    expect(generatePage({ ...migrated.selectedBook, page: 12 })).toEqual(expected)
  })
})

function legacySave(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    pose: { floor: 0, zone: { kind: 'gallery', gallery: 0 }, x: 0, y: 0, z: 4.35, yaw: 0 },
    selectedBook: { floor: 0, gallery: 0, wall: 'A', shelf: 1, book: 7 },
    questStatus: 'not-started',
    wordFinding: null,
    ...overrides,
  }
}

function v2Json(): string {
  writeSavedGame(defaultSavedGame())
  return localStorage.getItem(SAVE_KEY) ?? ''
}
