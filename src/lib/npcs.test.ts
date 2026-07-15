import { describe, expect, it } from 'vitest'
import { GALLERY_INDICES, FLOOR_INDICES } from './level'
import { INTERACTION_RADIUS, STARTING_PLAYER_POSE } from './roomGeometry'
import { distanceToNpc, isNpcReachable, npcForGallery } from './npcs'

describe('library monk NPCs', () => {
  it('always places the significant-word monk in the starting gallery', () => {
    const npc = npcForGallery(0, 0)
    expect(npc?.id).toBe('monk:0:0')
    expect(npc?.quest).toBe('significant-word')
    expect(npc?.dialogue.join(' ')).toMatch(/floor, gallery, wall, shelf, volume, and page/i)
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
