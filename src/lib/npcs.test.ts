import { describe, expect, it } from 'vitest'
import { LEGACY_FLOOR_COORDINATES, LEGACY_GALLERY_COORDINATES } from './level'
import { INTERACTION_RADIUS, STARTING_PLAYER_POSE } from './roomGeometry'
import { distanceToNpc, isNpcReachable, nearestNpc, npcForGallery, npcsForGallery } from './npcs'
import { coordinate } from './coordinate'

describe('library monk NPCs', () => {
  it('always places the significant-word monk in the starting gallery', () => {
    const npc = npcForGallery(coordinate(0), coordinate(0))
    expect(npc?.id).toBe('monk:0:0')
    expect(npc?.quest).toBe('significant-word')
    expect(npc?.dialogue.join(' ')).toMatch(/floor, gallery, wall, row, book, and page/i)
  })

  it('places a blue-marker word indexer at the opposite starting-gallery table', () => {
    const npcs = npcsForGallery(coordinate(0), coordinate(0))
    const finder = npcs.find((npc) => npc.quest === 'word-finder')
    expect(npcs).toHaveLength(2)
    expect(finder?.id).toBe('word-finder:0:0')
    expect(finder?.position.x).toBeGreaterThan(0)
    expect(finder?.dialogue.join(' ')).toMatch(/give me one word/i)
    expect(nearestNpc({ ...STARTING_PLAYER_POSE, x: 2.35, z: -0.65 }, npcs)).toEqual(finder)
  })

  it('spawns other monks deterministically and uncommonly', () => {
    const spawned = LEGACY_FLOOR_COORDINATES.flatMap((floor) => LEGACY_GALLERY_COORDINATES.map((gallery) => npcForGallery(floor, gallery))).filter(Boolean)
    expect(spawned.length).toBeGreaterThan(1)
    expect(spawned.length).toBeLessThan(8)
    expect(npcForGallery(coordinate(1), coordinate(2))).toEqual(npcForGallery(coordinate(1), coordinate(2)))
  })

  it('describes the Crimson Hexagon rumor without turning it into one red book', () => {
    const crimsonNpc = LEGACY_FLOOR_COORDINATES
      .flatMap((floor) => LEGACY_GALLERY_COORDINATES.map((gallery) => npcForGallery(floor, gallery)))
      .find((npc) => npc?.quest === 'crimson-book')
    const lore = crimsonNpc?.dialogue.join(' ') ?? ''

    expect(lore).toMatch(/Crimson Hexagon/)
    expect(lore).toMatch(/smaller than normal/)
    expect(lore).toMatch(/illustrated/)
    expect(lore).toMatch(/magical and omnipotent/)
    expect(lore).toMatch(/not one necessarily crimson-colored book/)
  })

  it('measures interaction distance only in the same gallery', () => {
    const npc = npcForGallery(coordinate(0), coordinate(0))
    const poseNearNpc = { ...STARTING_PLAYER_POSE, x: -2.35, z: 0.65 }
    const otherGallery = { ...STARTING_PLAYER_POSE, zone: { kind: 'gallery' as const, gallery: coordinate(1) } }
    expect(distanceToNpc(poseNearNpc, npc)).toBeLessThan(INTERACTION_RADIUS)
    expect(isNpcReachable(poseNearNpc, npc)).toBe(true)
    expect(isNpcReachable(STARTING_PLAYER_POSE, npc)).toBe(false)
    expect(distanceToNpc(otherGallery, npc)).toBe(Number.POSITIVE_INFINITY)
  })
})
