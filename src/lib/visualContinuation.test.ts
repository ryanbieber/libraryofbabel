import { describe, expect, it } from 'vitest'
import { LEGACY_CONNECTOR_COORDINATES, LEGACY_FLOOR_COORDINATES, LEGACY_GALLERY_COORDINATES, type FloorIndex } from './level'
import { FLOOR_HEIGHT, STARTING_PLAYER_POSE, type PlayerPose } from './roomGeometry'
import { MAX_VISIBLE_SCENES, visibleScenesForPose } from './sceneVisibility'
import {
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
import { coordinate } from './coordinate'

function representativePoses(): PlayerPose[] {
  const poses: PlayerPose[] = []
  for (const floor of LEGACY_FLOOR_COORDINATES) {
    for (const gallery of LEGACY_GALLERY_COORDINATES) {
      poses.push({ ...STARTING_PLAYER_POSE, floor, zone: { kind: 'gallery', gallery } })
    }
    for (const connector of LEGACY_CONNECTOR_COORDINATES) {
      poses.push({ ...STARTING_PLAYER_POSE, floor, zone: { kind: 'vestibule', connector } })
      poses.push({ ...STARTING_PLAYER_POSE, floor, zone: { kind: 'service', connector, room: 'sleeping' } })
      poses.push({ ...STARTING_PLAYER_POSE, floor, zone: { kind: 'service', connector, room: 'latrine' } })
    }
  }
  for (const connector of LEGACY_CONNECTOR_COORDINATES) {
    poses.push(stairPose(coordinate(-1), coordinate(0), connector))
    poses.push(stairPose(coordinate(0), coordinate(1), connector))
  }
  return poses
}

function stairPose(from: FloorIndex, to: FloorIndex, connector: (typeof LEGACY_CONNECTOR_COORDINATES)[number]): PlayerPose {
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
    expect(continuationBudgetForScenes(visibleScenesForPose(STARTING_PLAYER_POSE)).boundaries).toBe(0)
  })
})
