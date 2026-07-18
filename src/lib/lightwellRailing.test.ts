import { describe, expect, it } from 'vitest'
import {
  LIGHTWELL_RAILING_APOTHEM,
  LIGHTWELL_RAILING_BAR_INSTANCES,
  LIGHTWELL_RAILING_DRAW_CALLS,
  LIGHTWELL_RAILING_FINIAL_INSTANCES,
  LIGHTWELL_RAILING_PANEL_SPAN,
  LIGHTWELL_RAILING_POST_WIDTH,
  LIGHTWELL_RAILING_SIDES,
  LIGHTWELL_RAILING_VERTEX_RADIUS,
  lightwellRailingLayout,
} from './lightwellRailing'
import { LIGHTWELL_RADIUS, PLAYER_RADIUS } from './roomGeometry'

describe('Borges lightwell railing', () => {
  it('joins every polygon panel to its neighboring posts', () => {
    const halfPanel = LIGHTWELL_RAILING_PANEL_SPAN / 2
    const endpointRadius = Math.hypot(LIGHTWELL_RAILING_APOTHEM, halfPanel)

    expect(endpointRadius).toBeCloseTo(LIGHTWELL_RAILING_VERTEX_RADIUS)
  })

  it('stays between the open shaft and the existing player collision boundary', () => {
    expect(LIGHTWELL_RAILING_APOTHEM - 0.075 / 2).toBeGreaterThan(LIGHTWELL_RADIUS)
    expect(LIGHTWELL_RAILING_VERTEX_RADIUS + LIGHTWELL_RAILING_POST_WIDTH / 2)
      .toBeLessThan(LIGHTWELL_RADIUS + PLAYER_RADIUS)
  })

  it('uses one repeated layout rather than unique gallery geometry', () => {
    const layout = lightwellRailingLayout()
    expect(layout.bars).toHaveLength(LIGHTWELL_RAILING_BAR_INSTANCES)
    expect(layout.finials).toHaveLength(LIGHTWELL_RAILING_FINIAL_INSTANCES)
    expect(layout.bars.filter(({ kind }) => kind === 'post')).toHaveLength(LIGHTWELL_RAILING_SIDES)
    expect(layout.bars.filter(({ kind }) => kind === 'rail')).toHaveLength(LIGHTWELL_RAILING_SIDES * 3)
    expect(layout.bars.filter(({ kind }) => kind === 'brace')).toHaveLength(LIGHTWELL_RAILING_SIDES * 2)
  })

  it('keeps the ornament to a two-draw-call instance budget', () => {
    expect(LIGHTWELL_RAILING_DRAW_CALLS).toBe(2)
  })
})
