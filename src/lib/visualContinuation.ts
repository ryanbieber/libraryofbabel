import { galleriesForConnector } from './level'
import type { VisibleScene } from './sceneVisibility'

export const LIGHTWELL_SHELL_LEVELS = [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6] as const
export const LIGHTWELL_RAILS_PER_SHELL = 12
export const STAIR_FLIGHT_LEVELS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5] as const
export const STAIR_STEPS_PER_FLIGHT = 36
export const STAIR_POST_INTERVAL = 2
export const BOUNDARY_GALLERY_DEPTHS = [2.4, 5.15, 8.35, 12.05, 16.4] as const

export const LIGHTWELL_CONTINUATION_INSTANCES = LIGHTWELL_SHELL_LEVELS.length
  * (LIGHTWELL_RAILS_PER_SHELL + 2)
export const STAIR_CONTINUATION_INSTANCES = STAIR_FLIGHT_LEVELS.length
  * (STAIR_STEPS_PER_FLIGHT + STAIR_STEPS_PER_FLIGHT / STAIR_POST_INTERVAL + 1)
  + 10
export const BOUNDARY_CONTINUATION_INSTANCES = BOUNDARY_GALLERY_DEPTHS.length * 4

export const MAX_CONTINUATION_INSTANCES = 951
export const MAX_CONTINUATION_DRAW_CALLS = 23

export type ContinuationBudget = {
  instances: number
  drawCalls: number
  lightwells: number
  stairs: number
  boundaries: number
}

export function continuationBudgetForScenes(scenes: readonly VisibleScene[]): ContinuationBudget {
  const lightwells = scenes.filter(({ zone }) => zone.kind === 'gallery').length
  const stairs = scenes.filter(({ zone }) => zone.kind === 'stair').length
  const boundaries = scenes.reduce((count, { zone }) => {
    if (zone.kind !== 'vestibule') return count
    const neighbors = galleriesForConnector(zone.connector)
    return count + Number(neighbors.north === null) + Number(neighbors.south === null)
  }, 0)

  return {
    lightwells,
    stairs,
    boundaries,
    instances: lightwells * LIGHTWELL_CONTINUATION_INSTANCES
      + stairs * STAIR_CONTINUATION_INSTANCES
      + boundaries * BOUNDARY_CONTINUATION_INSTANCES,
    drawCalls: lightwells * 3 + stairs * 17 + boundaries * 3,
  }
}
