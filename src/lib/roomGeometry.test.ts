import { describe, expect, it } from 'vitest'
import { defaultAddress } from './library'
import { coordinate } from './coordinate'
import {
  BOOK_INTERACTION_RADIUS,
  GALLERY_APOTHEM,
  LIGHTWELL_RADIUS,
  STARTING_PLAYER_POSE,
  STAIR_TRAVEL_DISTANCE,
  VESTIBULE_HALF_DEPTH,
  bookWorldPosition,
  distanceToBook,
  isBookReachable,
  movePose,
  poseNearBook,
  rotatePose,
  stairCameraPose,
} from './roomGeometry'

describe('hexagonal first-person geometry', () => {
  it('starts at the clear southern threshold facing into the library', () => {
    expect(STARTING_PLAYER_POSE.x).toBe(0)
    expect(STARTING_PLAYER_POSE.z).toBeGreaterThan(4)
    expect(STARTING_PLAYER_POSE.yaw).toBe(0)
  })

  it('walks continuously from a gallery into its north vestibule', () => {
    const pose = { ...STARTING_PLAYER_POSE, x: 0, z: -GALLERY_APOTHEM + 0.05, yaw: 0 }
    const result = movePose(pose, 1, 0, 0.25)
    expect(result.transition).toBe('vestibule')
    expect(result.pose.zone).toEqual({ kind: 'vestibule', connector: -1n })
  })

  it('walks across both former gallery end gates', () => {
    const northEnd = {
      ...STARTING_PLAYER_POSE,
      zone: { kind: 'vestibule' as const, connector: coordinate(-3) },
      x: 0,
      z: -VESTIBULE_HALF_DEPTH + 0.05,
      yaw: 0,
    }
    const southEnd = { ...northEnd, zone: { kind: 'vestibule' as const, connector: coordinate(2) }, z: VESTIBULE_HALF_DEPTH - 0.05, yaw: Math.PI }
    expect(movePose(northEnd, 1, 0, 0.25).pose.zone).toEqual({ kind: 'gallery', gallery: -3n })
    expect(movePose(southEnd, 1, 0, 0.25).pose.zone).toEqual({ kind: 'gallery', gallery: 3n })
  })

  it('keeps the player behind the lightwell railing', () => {
    const pose = { ...STARTING_PLAYER_POSE, x: LIGHTWELL_RADIUS + 0.25, z: 0, yaw: -Math.PI / 2 }
    const result = movePose(pose, 1, 0, 0.2)
    expect(result.blocked).toBe('lightwell')
    expect(result.pose).toEqual(pose)
  })

  it('enters both atmospheric service rooms from a vestibule', () => {
    const vestibule = { ...STARTING_PLAYER_POSE, zone: { kind: 'vestibule' as const, connector: coordinate(-1) }, x: -2.55, z: -0.6, yaw: -Math.PI / 2 }
    const result = movePose(vestibule, 1, 0, 0.3)
    expect(result.pose.zone).toEqual({ kind: 'service', connector: -1n, room: 'sleeping' })
    const latrine = movePose({ ...vestibule, z: 0.6 }, 1, 0, 0.3)
    expect(latrine.pose.zone).toEqual({ kind: 'service', connector: -1n, room: 'latrine' })
  })

  it('walks a full guided spiral flight and changes floor', () => {
    const vestibule = { ...STARTING_PLAYER_POSE, zone: { kind: 'vestibule' as const, connector: coordinate(-1) }, x: 2.55, z: -0.4, yaw: Math.PI / 2 }
    const entered = movePose(vestibule, 1, 0, 0.3)
    expect(entered.pose.zone.kind).toBe('stair')
    const finished = movePose(entered.pose, 1, 0, 8)
    expect(finished.transition).toBe('floor')
    expect(finished.pose.floor).toBe(1n)
    expect(finished.pose.zone).toEqual({ kind: 'vestibule', connector: -1n })
  })

  it('crosses both former floor boundaries and continues indefinitely', () => {
    const top = { ...STARTING_PLAYER_POSE, floor: coordinate(1), zone: { kind: 'vestibule' as const, connector: coordinate(0) }, x: 2.55, z: -0.4, yaw: Math.PI / 2 }
    const upward = movePose(top, 1, 0, 0.3)
    if (upward.pose.zone.kind !== 'stair') throw new Error('Expected stair')
    expect(upward.pose.zone.to).toBe(2n)

    const bottom = { ...top, floor: coordinate(-1), z: 0.4 }
    const downward = movePose(bottom, 1, 0, 0.3)
    if (downward.pose.zone.kind !== 'stair') throw new Error('Expected stair')
    expect(downward.pose.zone.to).toBe(-2n)
  })

  it('provides a continuous helical camera path', () => {
    const ascending = { ...STARTING_PLAYER_POSE, zone: { kind: 'stair' as const, connector: coordinate(0), from: coordinate(0), to: coordinate(1), distance: STAIR_TRAVEL_DISTANCE / 2 } }
    const descending = { ...STARTING_PLAYER_POSE, floor: coordinate(1), zone: { kind: 'stair' as const, connector: coordinate(0), from: coordinate(1), to: coordinate(0), distance: STAIR_TRAVEL_DISTANCE / 2 } }

    expect(stairCameraPose(ascending).y).toBeCloseTo(1.7)
    expect(stairCameraPose(descending).y).toBeCloseTo(1.7)
    expect(stairCameraPose(ascending).yaw).not.toBeCloseTo(stairCameraPose(descending).yaw)
  })

  it('lets the player reverse along the stair track and return to the original landing', () => {
    const vestibule = { ...STARTING_PLAYER_POSE, zone: { kind: 'vestibule' as const, connector: coordinate(-1) }, x: 2.55, z: -0.4, yaw: Math.PI / 2 }
    const entered = movePose(vestibule, 1, 0, 0.3)
    const advanced = movePose(entered.pose, 1, 0, 2)
    const reversed = movePose(advanced.pose, -1, 0, 0.75)

    expect(reversed.pose.zone).toMatchObject({ kind: 'stair', distance: 1.25 })
    const returned = movePose(reversed.pose, -1, 0, 2)
    expect(returned.transition).toBe('vestibule')
    expect(returned.pose.floor).toBe(0n)
    expect(returned.pose.zone).toEqual({ kind: 'vestibule', connector: -1n })
  })

  it('places a player close enough to interact with a selected book', () => {
    const pose = poseNearBook(defaultAddress)
    expect(distanceToBook(pose, defaultAddress)).toBeLessThan(BOOK_INTERACTION_RADIUS)
    expect(Math.hypot(bookWorldPosition(defaultAddress).x, bookWorldPosition(defaultAddress).z)).toBeGreaterThan(4)
    expect(isBookReachable(pose, defaultAddress)).toBe(true)
    expect(rotatePose(pose, Math.PI / 2).yaw).not.toBe(pose.yaw)
  })
})
