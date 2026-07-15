import { describe, expect, it } from 'vitest'
import { GALLERY_INDICES, FLOOR_INDICES } from './level'
import { INTERACTION_RADIUS, STARTING_PLAYER_POSE } from './roomGeometry'
import { distanceToNpc, isNpcReachable, nearestNpc, npcForGallery, npcsForGallery } from './npcs'

describe('library monk NPCs', () => {
  it('always places the significant-word monk in the starting gallery', () => {
    const npc = npcForGallery(0, 0)
    expect(npc?.id).toBe('monk:0:0')
    expect(npc?.quest).toBe('significant-word')
    expect(npc?.dialogue.join(' ')).toMatch(/floor, gallery, wall, shelf, volume, and page/i)
  })

  it('places a blue-marker word indexer at the opposite starting-gallery table', () => {
    const npcs = npcsForGallery(0, 0)
    const finder = npcs.find((npc) => npc.quest === 'word-finder')
    expect(npcs).toHaveLength(2)
    expect(finder?.id).toBe('word-finder:0:0')
    expect(finder?.position.x).toBeGreaterThan(0)
    expect(finder?.dialogue.join(' ')).toMatch(/give me one word/i)
    expect(nearestNpc({ ...STARTING_PLAYER_POSE, x: 2.35, z: -0.65 }, npcs)).toEqual(finder)
  })

  it('spawns other monks deterministically and uncommonly', () => {
    const spawned = FLOOR_INDICES.flatMap((floor) => GALLERY_INDICES.map((gallery) => npcForGallery(floor, gallery))).filter(Boolean)
    expect(spawned.length).toBeGreaterThan(1)
    expect(spawned.length).toBeLessThan(8)
    expect(npcForGallery(1, 2)).toEqual(npcForGallery(1, 2))
  })

  it('measures interaction distance only in the same gallery', () => {
    const npc = npcForGallery(0, 0)
    const otherGallery = { ...STARTING_PLAYER_POSE, zone: { kind: 'gallery' as const, gallery: 1 as const } }
    expect(distanceToNpc(STARTING_PLAYER_POSE, npc)).toBeLessThan(INTERACTION_RADIUS)
    expect(isNpcReachable(STARTING_PLAYER_POSE, npc)).toBe(true)
    expect(distanceToNpc(otherGallery, npc)).toBe(Number.POSITIVE_INFINITY)
  })
})
