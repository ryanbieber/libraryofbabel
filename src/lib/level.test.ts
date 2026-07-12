import { describe, expect, it } from 'vitest'
import { canMove, cardinalDirections, levelRooms, nextRoom, roomDoors, roomHasFeature, roomKey, startingRoom } from './level'

describe('library floor level', () => {
  it('uses cardinal doors only', () => {
    expect(cardinalDirections.map((direction) => direction.label)).toEqual(['north', 'east', 'south', 'west'])
    expect(roomDoors(startingRoom)).toEqual([0, 1, 2, 3])
  })

  it('blocks movement where the floor has no neighboring room', () => {
    expect(canMove({ q: 2, r: 0 }, 1, 1)).toBe(false)
    expect(canMove({ q: 2, r: 0 }, 3, 1)).toBe(true)
  })

  it('places stairs on dedicated rooms in the repeated floor plan', () => {
    expect(roomHasFeature({ q: 2, r: 0 }, 'stairs-up')).toBe(true)
    expect(roomHasFeature({ q: -2, r: 0 }, 'stairs-down')).toBe(true)
    expect(roomHasFeature(startingRoom, 'stairs-up')).toBe(false)
  })

  it('keeps the whole floor reachable from the starting room', () => {
    const seen = new Set<string>([roomKey(startingRoom)])
    const queue = [startingRoom]

    while (queue.length > 0) {
      const current = queue.shift()!
      for (const direction of roomDoors(current)) {
        const destination = nextRoom(current, direction, 1)
        const key = roomKey(destination)
        if (!seen.has(key)) {
          seen.add(key)
          queue.push(destination)
        }
      }
    }

    expect(seen.size).toBe(levelRooms.length)
  })
})
