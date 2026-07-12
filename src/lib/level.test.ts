import { describe, expect, it } from 'vitest'
import { canMove, cardinalDirections, roomDoors, roomHasFeature, startingRoom } from './level'

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
})
