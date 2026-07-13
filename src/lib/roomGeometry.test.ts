import { describe, expect, it } from 'vitest'
import { defaultAddress } from './library'
import {
  DOOR_HALF_WIDTH,
  INTERACTION_RADIUS,
  PLAYER_RADIUS,
  ROOM_HALF_SIZE,
  STARTING_PLAYER_POSE,
  bookWorldPosition,
  distanceToBook,
  isBookReachable,
  movePose,
  poseNearBook,
  rotatePose,
  yawToDirection,
} from './roomGeometry'

describe('first-person room geometry', () => {
  it('moves through an available doorway and enters the neighboring room', () => {
    const result = movePose({ ...STARTING_PLAYER_POSE, z: -ROOM_HALF_SIZE + PLAYER_RADIUS + 0.02 }, 1, 0, 0.2)

    expect(result.crossed).toBe(0)
    expect(result.pose.roomQ).toBe(0)
    expect(result.pose.roomR).toBe(-1)
    expect(result.pose.z).toBeGreaterThan(0)
  })

  it('blocks movement into a wall away from the doorway', () => {
    const result = movePose(
      { ...STARTING_PLAYER_POSE, x: DOOR_HALF_WIDTH + 0.6, z: -ROOM_HALF_SIZE + PLAYER_RADIUS + 0.02 },
      1,
      0,
      0.2,
    )

    expect(result.blocked).toBe(0)
    expect(result.pose.roomR).toBe(0)
    expect(result.pose.z).toBe(-ROOM_HALF_SIZE + PLAYER_RADIUS)
  })

  it('rotates freely but maps yaw back to the nearest cardinal direction', () => {
    expect(yawToDirection(rotatePose(STARTING_PLAYER_POSE, Math.PI / 2).yaw)).toBe(1)
    expect(yawToDirection(rotatePose(STARTING_PLAYER_POSE, Math.PI * 1.9).yaw)).toBe(0)
  })

  it('places a player close enough to interact with a selected book', () => {
    const pose = poseNearBook(defaultAddress)
    const bookPosition = bookWorldPosition(defaultAddress)

    expect(distanceToBook(pose, defaultAddress)).toBeLessThan(INTERACTION_RADIUS)
    expect(Math.abs(bookPosition.z)).toBeGreaterThan(ROOM_HALF_SIZE - 0.3)
    expect(isBookReachable(pose, defaultAddress)).toBe(true)
  })
})
