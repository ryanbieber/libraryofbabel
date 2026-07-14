import { describe, expect, it } from 'vitest'
import { canMove, cardinalDirections, levelRooms, nextRoom, roomDoors, roomHasFeature, roomKey, startingRoom } from './level'

describe('library level', () => {
  it('uses cardinal doors only', () => {
    expect(cardinalDirections.map((direction) => direction.label)).toEqual(['north', 'east', 'south', 'west'])
    expect(roomDoors(startingRoom)).toEqual([0, 1, 2, 3])
  })

  it('blocks movement where the map has no neighboring room', () => {
    expect(canMove({ q: 2, r: 0 }, 1, 1)).toBe(false)
    expect(canMove({ q: 2, r: 0 }, 3, 1)).toBe(true)
  })

  it('keeps archive rooms as ordinary stack rooms without stairs', () => {
    expect(roomHasFeature({ q: 2, r: 0 }, 'stacks')).toBe(true)
    expect(roomHasFeature({ q: -2, r: 0 }, 'stacks')).toBe(true)
    expect(levelRooms.flatMap((room) => room.features).some((feature) => feature.startsWith('stairs'))).toBe(false)
  })

  it('keeps the whole map reachable from the starting room', () => {
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
