import { describe, expect, it } from 'vitest'
import { CONNECTOR_INDICES, FLOOR_INDICES, GALLERY_INDICES, type FloorIndex } from './level'
import { FLOOR_HEIGHT, STARTING_PLAYER_POSE, type PlayerPose } from './roomGeometry'
import { MAX_VISIBLE_SCENES, visibleScenesForPose } from './sceneVisibility'
import {
  BOUNDARY_CONTINUATION_INSTANCES,
  BOUNDARY_GALLERY_DEPTHS,
  LIGHTWELL_CONTINUATION_INSTANCES,
  LIGHTWELL_RAILS_PER_SHELL,
  LIGHTWELL_SHELL_LEVELS,
  MAX_CONTINUATION_DRAW_CALLS,
  MAX_CONTINUATION_INSTANCES,
  STAIR_CONTINUATION_INSTANCES,
  STAIR_FLIGHT_LEVELS,
  STAIR_POST_INTERVAL,
  STAIR_STEPS_PER_FLIGHT,
  continuationBudgetForScenes,
} from './visualContinuation'

function representativePoses(): PlayerPose[] {
  const poses: PlayerPose[] = []
  for (const floor of FLOOR_INDICES) {
    for (const gallery of GALLERY_INDICES) {
      poses.push({ ...STARTING_PLAYER_POSE, floor, zone: { kind: 'gallery', gallery } })
    }
    for (const connector of CONNECTOR_INDICES) {
      poses.push({ ...STARTING_PLAYER_POSE, floor, zone: { kind: 'vestibule', connector } })
      poses.push({ ...STARTING_PLAYER_POSE, floor, zone: { kind: 'service', connector, room: 'sleeping' } })
      poses.push({ ...STARTING_PLAYER_POSE, floor, zone: { kind: 'service', connector, room: 'latrine' } })
    }
  }
  for (const connector of CONNECTOR_INDICES) {
    poses.push(stairPose(-1, 0, connector))
    poses.push(stairPose(0, 1, connector))
  }
  return poses
}

function stairPose(from: FloorIndex, to: FloorIndex, connector: (typeof CONNECTOR_INDICES)[number]): PlayerPose {
  return {
    ...STARTING_PLAYER_POSE,
    floor: from,
    zone: { kind: 'stair', connector, from, to, distance: FLOOR_HEIGHT / 2 },
  }
}

describe('visual continuation construction', () => {
  it('constructs every visible scene and continuation budget deterministically', () => {
    for (const pose of representativePoses()) {
      const firstScenes = visibleScenesForPose(pose)
      const secondScenes = visibleScenesForPose(pose)
      expect(secondScenes).toEqual(firstScenes)
      expect(continuationBudgetForScenes(secondScenes)).toEqual(continuationBudgetForScenes(firstScenes))
    }
  })

  it('keeps every representative pose within the scene, instance, and draw-call caps', () => {
    let largestSceneCount = 0
    let largestInstanceCount = 0
    let largestDrawCallCount = 0

    for (const pose of representativePoses()) {
      const scenes = visibleScenesForPose(pose)
      const budget = continuationBudgetForScenes(scenes)
      largestSceneCount = Math.max(largestSceneCount, scenes.length)
      largestInstanceCount = Math.max(largestInstanceCount, budget.instances)
      largestDrawCallCount = Math.max(largestDrawCallCount, budget.drawCalls)
    }

    expect(largestSceneCount).toBe(MAX_VISIBLE_SCENES)
    expect(largestInstanceCount).toBe(MAX_CONTINUATION_INSTANCES)
    expect(largestDrawCallCount).toBe(MAX_CONTINUATION_DRAW_CALLS)
  })

  it('derives the caps from fixed, perception-limited instance sets', () => {
    expect(LIGHTWELL_CONTINUATION_INSTANCES).toBe(
      LIGHTWELL_SHELL_LEVELS.length * (LIGHTWELL_RAILS_PER_SHELL + 2),
    )
    expect(STAIR_CONTINUATION_INSTANCES).toBe(
      STAIR_FLIGHT_LEVELS.length
        * (STAIR_STEPS_PER_FLIGHT + STAIR_STEPS_PER_FLIGHT / STAIR_POST_INTERVAL + 1)
        + 10,
    )
    expect(BOUNDARY_CONTINUATION_INSTANCES).toBe(BOUNDARY_GALLERY_DEPTHS.length * 4)
  })
})
