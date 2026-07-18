import { describe, expect, it } from 'vitest'
import { SERVICE_PORTAL_WIDTH } from './roomGeometry'
import {
  STAIR_ENTRANCE_RAIL_GAP_FRACTION,
  STAIR_HANDRAIL_RADIUS,
  STAIR_LANDING_DEPTH,
  STAIR_LANDING_RADIUS,
  STAIR_SHAFT_RADIUS,
  STAIR_TREAD_WIDTH,
  isStairEntranceGap,
} from './stairGeometry'

describe('spiral stair entrance geometry', () => {
  it('bridges the vestibule threshold to the first tread with a full-width landing', () => {
    const landingOuterEdge = STAIR_LANDING_RADIUS + STAIR_TREAD_WIDTH / 2
    expect(STAIR_SHAFT_RADIUS - landingOuterEdge).toBeLessThan(0.1)
    expect(STAIR_LANDING_DEPTH).toBeGreaterThanOrEqual(SERVICE_PORTAL_WIDTH)
  })

  it('opens the outer handrail wider than the visible vestibule portal', () => {
    const halfGapWidth = STAIR_HANDRAIL_RADIUS * Math.sin(STAIR_ENTRANCE_RAIL_GAP_FRACTION * Math.PI * 2)
    expect(halfGapWidth).toBeGreaterThan(SERVICE_PORTAL_WIDTH / 2)
    expect(isStairEntranceGap(0)).toBe(true)
    expect(isStairEntranceGap(0.03)).toBe(true)
    expect(isStairEntranceGap(0.5)).toBe(false)
    expect(isStairEntranceGap(0.97)).toBe(true)
    expect(isStairEntranceGap(1)).toBe(true)
  })
})
