import { describe, expect, it } from 'vitest'
import {
  COMPACT_DOORWAY_HEIGHT,
  PLAYER_EYE_HEIGHT,
  ROOM_HEIGHT,
  SEATED_MONK_BASE_Y,
  SEATED_MONK_SCALE,
  STANDARD_DOORWAY_HEIGHT,
  doorwayWorldBounds,
  seatedMonkWorldBounds,
} from './sceneScale'

describe('scene scale helpers', () => {
  it('grounds a standard wall doorway at floor level', () => {
    const bounds = doorwayWorldBounds(STANDARD_DOORWAY_HEIGHT, ROOM_HEIGHT / 2)
    expect(bounds.bottom).toBeCloseTo(0)
  })

  it('grounds a compact shelf doorway at floor level', () => {
    const bounds = doorwayWorldBounds(COMPACT_DOORWAY_HEIGHT, 1.42)
    expect(bounds.bottom).toBeCloseTo(0)
  })

  it('keeps doorway tops above player eye height and below the room ceiling', () => {
    const standard = doorwayWorldBounds(STANDARD_DOORWAY_HEIGHT, ROOM_HEIGHT / 2)
    const compact = doorwayWorldBounds(COMPACT_DOORWAY_HEIGHT, 1.42)

    expect(standard.top).toBeGreaterThan(PLAYER_EYE_HEIGHT)
    expect(standard.top).toBeLessThan(ROOM_HEIGHT)
    expect(compact.top).toBeGreaterThan(PLAYER_EYE_HEIGHT)
    expect(compact.top).toBeLessThan(ROOM_HEIGHT)
  })

  it('anchors the seated monk to the floor at human eye scale', () => {
    const bounds = seatedMonkWorldBounds(SEATED_MONK_SCALE, SEATED_MONK_BASE_Y)
    expect(bounds.bottom).toBeCloseTo(0)
    expect(bounds.top).toBeGreaterThan(PLAYER_EYE_HEIGHT - 0.1)
    expect(bounds.top).toBeLessThan(PLAYER_EYE_HEIGHT + 0.15)
  })
})
