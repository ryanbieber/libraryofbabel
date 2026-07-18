import { LIGHTWELL_RADIUS, RAILING_HEIGHT } from './roomGeometry'

export const LIGHTWELL_RAILING_SIDES = 12
export const LIGHTWELL_RAILING_APOTHEM = LIGHTWELL_RADIUS + 0.11
export const LIGHTWELL_RAILING_VERTEX_RADIUS = LIGHTWELL_RAILING_APOTHEM / Math.cos(Math.PI / LIGHTWELL_RAILING_SIDES)
export const LIGHTWELL_RAILING_PANEL_SPAN = 2 * LIGHTWELL_RAILING_APOTHEM * Math.tan(Math.PI / LIGHTWELL_RAILING_SIDES)
export const LIGHTWELL_RAILING_POST_WIDTH = 0.045
export const LIGHTWELL_RAILING_TOP = RAILING_HEIGHT + 0.04
export const LIGHTWELL_RAILING_FINIAL_RADIUS = 0.065
export const LIGHTWELL_RAILING_DRAW_CALLS = 2

export type LightwellRailingBar = {
  kind: 'post' | 'rail' | 'brace'
  position: readonly [number, number, number]
  rotationY: number
  rotationZ: number
  scale: readonly [number, number, number]
}

export type LightwellRailingFinial = {
  position: readonly [number, number, number]
  rotationY: number
}

export type LightwellRailingLayout = {
  bars: readonly LightwellRailingBar[]
  finials: readonly LightwellRailingFinial[]
}

const PANEL_RAILS = [
  { y: LIGHTWELL_RAILING_TOP - 0.04, height: 0.08, depth: 0.075 },
  { y: 0.72, height: 0.035, depth: 0.045 },
  { y: 0.26, height: 0.035, depth: 0.045 },
] as const
const BRACE_RISE = 0.4
const BRACE_HORIZONTAL_SPAN = LIGHTWELL_RAILING_PANEL_SPAN * 0.78
const BRACE_LENGTH = Math.hypot(BRACE_HORIZONTAL_SPAN, BRACE_RISE)
const BRACE_ANGLE = Math.atan2(BRACE_RISE, BRACE_HORIZONTAL_SPAN)

export const LIGHTWELL_RAILING_BAR_INSTANCES = LIGHTWELL_RAILING_SIDES * 6
export const LIGHTWELL_RAILING_FINIAL_INSTANCES = LIGHTWELL_RAILING_SIDES

export function lightwellRailingLayout(): LightwellRailingLayout {
  const bars: LightwellRailingBar[] = []
  const finials: LightwellRailingFinial[] = []
  const angleStep = Math.PI * 2 / LIGHTWELL_RAILING_SIDES

  for (let side = 0; side < LIGHTWELL_RAILING_SIDES; side += 1) {
    const vertexAngle = side * angleStep
    bars.push({
      kind: 'post',
      position: [
        Math.cos(vertexAngle) * LIGHTWELL_RAILING_VERTEX_RADIUS,
        LIGHTWELL_RAILING_TOP / 2,
        Math.sin(vertexAngle) * LIGHTWELL_RAILING_VERTEX_RADIUS,
      ],
      rotationY: -vertexAngle,
      rotationZ: 0,
      scale: [LIGHTWELL_RAILING_POST_WIDTH, LIGHTWELL_RAILING_TOP, LIGHTWELL_RAILING_POST_WIDTH],
    })
    finials.push({
      position: [
        Math.cos(vertexAngle) * LIGHTWELL_RAILING_VERTEX_RADIUS,
        LIGHTWELL_RAILING_TOP + LIGHTWELL_RAILING_FINIAL_RADIUS * 0.82,
        Math.sin(vertexAngle) * LIGHTWELL_RAILING_VERTEX_RADIUS,
      ],
      rotationY: Math.PI / 4 - vertexAngle,
    })

    const panelAngle = (side + 0.5) * angleStep
    const panelPosition = [
      Math.cos(panelAngle) * LIGHTWELL_RAILING_APOTHEM,
      0,
      Math.sin(panelAngle) * LIGHTWELL_RAILING_APOTHEM,
    ] as const
    const tangentRotation = Math.PI / 2 - panelAngle

    PANEL_RAILS.forEach((rail) => {
      bars.push({
        kind: 'rail',
        position: [panelPosition[0], rail.y, panelPosition[2]],
        rotationY: tangentRotation,
        rotationZ: 0,
        scale: [LIGHTWELL_RAILING_PANEL_SPAN + LIGHTWELL_RAILING_POST_WIDTH, rail.height, rail.depth],
      })
    })

    for (const direction of [-1, 1] as const) {
      bars.push({
        kind: 'brace',
        position: [panelPosition[0], 0.49, panelPosition[2]],
        rotationY: tangentRotation,
        rotationZ: direction * BRACE_ANGLE,
        scale: [BRACE_LENGTH, 0.028, 0.04],
      })
    }
  }

  return { bars, finials }
}
