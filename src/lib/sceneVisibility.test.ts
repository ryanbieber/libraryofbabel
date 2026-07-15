import { describe, expect, it } from 'vitest'
import { GALLERY_APOTHEM, STARTING_PLAYER_POSE, VESTIBULE_HALF_DEPTH } from './roomGeometry'
import { MAX_VISIBLE_SCENES, visibleScenesForPose } from './sceneVisibility'

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
      zone: { kind: 'vestibule', connector: 0 },
      x: 0,
      z: 0,
    })

    expect(scenes).toHaveLength(MAX_VISIBLE_SCENES)
    expect(scenes.map(({ zone }) => zone.kind)).toEqual(['vestibule', 'gallery', 'gallery', 'service', 'service', 'stair'])
    expect(scenes.filter(({ isCurrent }) => isCurrent)).toHaveLength(1)
  })

  it('keeps a service room limited to itself and its vestibule', () => {
    const scenes = visibleScenesForPose({
      ...STARTING_PLAYER_POSE,
      zone: { kind: 'service', connector: 0, room: 'sleeping' },
      x: 0,
      z: 0,
    })

    expect(scenes).toHaveLength(2)
    expect(scenes.map(({ zone }) => zone.kind)).toEqual(['service', 'vestibule'])
  })

  it('shows both landings while traveling on a stair', () => {
    const scenes = visibleScenesForPose({
      ...STARTING_PLAYER_POSE,
      zone: { kind: 'stair', connector: 0, from: 0, to: 1, progress: 0.5 },
      x: 0,
      z: 0,
    })

    expect(scenes).toHaveLength(3)
    expect(scenes.map(({ floor }) => floor)).toEqual([0, 0, 1])
    expect(scenes.map(({ zone }) => zone.kind)).toEqual(['stair', 'vestibule', 'vestibule'])
  })
})
