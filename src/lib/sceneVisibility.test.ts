import { describe, expect, it } from 'vitest'
import { FLOOR_HEIGHT, GALLERY_APOTHEM, STARTING_PLAYER_POSE, VESTIBULE_HALF_DEPTH } from './roomGeometry'
import { MAX_VISIBLE_SCENES, visibleScenesForPose } from './sceneVisibility'
import { coordinate } from './coordinate'

describe('adjacent scene visibility', () => {
  it('loads only the two vestibules connected to the current gallery', () => {
    const scenes = visibleScenesForPose(STARTING_PLAYER_POSE)

    expect(scenes).toHaveLength(3)
    expect(scenes.map(({ zone }) => zone.kind)).toEqual(['gallery', 'vestibule', 'vestibule'])
    expect(scenes[1].position[2]).toBe(-(GALLERY_APOTHEM + VESTIBULE_HALF_DEPTH))
    expect(scenes[2].position[2]).toBe(GALLERY_APOTHEM + VESTIBULE_HALF_DEPTH)
  })

  it('loads the rooms directly connected to a vestibule without loading the library', () => {
    const scenes = visibleScenesForPose({
      ...STARTING_PLAYER_POSE,
      zone: { kind: 'vestibule', connector: coordinate(0) },
      x: 0,
      z: 0,
    })

    expect(scenes).toHaveLength(MAX_VISIBLE_SCENES)
    expect(scenes.map(({ zone }) => zone.kind)).toEqual(['vestibule', 'gallery', 'gallery', 'service', 'service', 'stair'])
    expect(scenes.filter(({ isCurrent }) => isCurrent)).toHaveLength(1)
  })

  it('aligns each vestibule stair lane with the landing used after entry', () => {
    const ascending = visibleScenesForPose({
      ...STARTING_PLAYER_POSE,
      zone: { kind: 'vestibule', connector: coordinate(0) },
      x: 2.3,
      z: -0.4,
    }).find(({ zone }) => zone.kind === 'stair')
    const descending = visibleScenesForPose({
      ...STARTING_PLAYER_POSE,
      zone: { kind: 'vestibule', connector: coordinate(0) },
      x: 2.3,
      z: 0.4,
    }).find(({ zone }) => zone.kind === 'stair')

    expect(ascending?.position[1]).toBe(0)
    expect(descending?.position[1]).toBe(-FLOOR_HEIGHT)
  })

  it('keeps a service room limited to itself and its vestibule', () => {
    const scenes = visibleScenesForPose({
      ...STARTING_PLAYER_POSE,
      zone: { kind: 'service', connector: coordinate(0), room: 'sleeping' },
      x: 0,
      z: 0,
    })

    expect(scenes).toHaveLength(2)
    expect(scenes.map(({ zone }) => zone.kind)).toEqual(['service', 'vestibule'])
  })

  it('shows both landings while traveling on a stair', () => {
    const scenes = visibleScenesForPose({
      ...STARTING_PLAYER_POSE,
      zone: { kind: 'stair', connector: coordinate(0), from: coordinate(0), to: coordinate(1), distance: 3.9 },
      x: 0,
      z: 0,
    })

    expect(scenes).toHaveLength(3)
    expect(scenes.map(({ floor }) => floor)).toEqual([0n, 0n, 1n])
    expect(scenes.map(({ zone }) => zone.kind)).toEqual(['stair', 'vestibule', 'vestibule'])
  })

  it('keeps scene count and local positions bounded at enormous coordinates', () => {
    const scenes = visibleScenesForPose({
      ...STARTING_PLAYER_POSE,
      floor: coordinate('999999999999999999999999999999999'),
      zone: { kind: 'vestibule', connector: coordinate('-888888888888888888888888888888888') },
      x: 0,
      z: 0,
    })

    expect(scenes).toHaveLength(MAX_VISIBLE_SCENES)
    expect(scenes.every(({ position }) => position.every(Number.isFinite))).toBe(true)
    expect(Math.max(...scenes.flatMap(({ position }) => position.map(Math.abs)))).toBeLessThan(10)
  })
})
