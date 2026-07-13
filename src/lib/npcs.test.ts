import { describe, expect, it } from 'vitest'
import { INTERACTION_RADIUS, STARTING_PLAYER_POSE } from './roomGeometry'
import { distanceToNpc, isNpcReachable, npcForRoom } from './npcs'

describe('library monk NPCs', () => {
  it('spawns deterministically with at most one monk per floor and room', () => {
    const room = { q: 0, r: 0 }
    const first = npcForRoom(0, room)
    const second = npcForRoom(0, room)

    expect(first).not.toBeNull()
    expect(second).toEqual(first)
    expect(first?.id).toBe('monk:0:0:0')
  })

  it('keeps the spawn rate uncommon across the mapped floor plan', () => {
    const rooms = [
      { q: 0, r: -2 },
      { q: -1, r: -1 },
      { q: 0, r: -1 },
      { q: 1, r: -1 },
      { q: -2, r: 0 },
      { q: -1, r: 0 },
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
      { q: 1, r: 1 },
      { q: 0, r: 2 },
    ]

    const spawned = rooms.map((room) => npcForRoom(0, room)).filter(Boolean)

    expect(spawned).toHaveLength(3)
  })

  it('assigns quests and dialogue deterministically', () => {
    const startingRoomNpc = npcForRoom(0, { q: 0, r: 0 })
    const otherFloorNpc = npcForRoom(1, { q: 1, r: 1 })

    expect(startingRoomNpc?.quest).toBe('crimson-book')
    expect(startingRoomNpc?.dialogue).toEqual(npcForRoom(0, { q: 0, r: 0 })?.dialogue)
    expect(startingRoomNpc?.dialogue.join(' ')).toMatch(/crimson book|crimson hexagon/i)
    expect(otherFloorNpc?.quest).toBe('messiah')
    expect(otherFloorNpc?.dialogue.join(' ')).toMatch(/Man of the Book|page has learned to walk/i)
  })

  it('measures interaction distance in the same room only', () => {
    const npc = npcForRoom(0, { q: 0, r: 0 })
    const farPose = { ...STARTING_PLAYER_POSE, x: INTERACTION_RADIUS + 0.7, z: INTERACTION_RADIUS + 0.7 }
    const otherRoomPose = { ...STARTING_PLAYER_POSE, roomQ: 1 }

    expect(distanceToNpc(STARTING_PLAYER_POSE, npc)).toBeLessThan(INTERACTION_RADIUS)
    expect(isNpcReachable(STARTING_PLAYER_POSE, npc)).toBe(true)
    expect(isNpcReachable(farPose, npc)).toBe(false)
    expect(distanceToNpc(otherRoomPose, npc)).toBe(Number.POSITIVE_INFINITY)
  })
})
