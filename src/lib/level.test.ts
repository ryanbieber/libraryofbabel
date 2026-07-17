import { describe, expect, it } from 'vitest'
import { coordinate, serializeCoordinate } from './coordinate'
import {
  adjacentFloor,
  galleriesForConnector,
  northConnector,
  southConnector,
  worldKey,
} from './level'

describe('unbounded library topology', () => {
  it('uses total connector arithmetic at negative and enormous galleries', () => {
    expect(northConnector(coordinate(0))).toBe(-1n)
    expect(southConnector(coordinate(0))).toBe(0n)
    expect(galleriesForConnector(coordinate(-3))).toEqual({ north: -3n, south: -2n })

    const huge = coordinate('999999999999999999999999999999')
    expect(serializeCoordinate(northConnector(huge))).toBe('999999999999999999999999999998')
    expect(galleriesForConnector(huge)).toEqual({
      north: 999999999999999999999999999999n,
      south: 1000000000000000000000000000000n,
    })
  })

  it('continues to adjacent floors indefinitely in either direction', () => {
    expect(adjacentFloor(coordinate(-1), -1)).toBe(-2n)
    expect(adjacentFloor(coordinate(1), 1)).toBe(2n)
    expect(adjacentFloor(coordinate('900719925474099999999'), 1)).toBe(900719925474100000000n)
  })

  it('keeps legacy world keys stable and includes complete global coordinates', () => {
    expect(worldKey(coordinate(0), { kind: 'gallery', gallery: coordinate(0) })).toBe('0:gallery:0')
    expect(worldKey(coordinate(-1), { kind: 'service', connector: coordinate(-2), room: 'sleeping' })).toBe('-1:sleeping:-2')
    expect(worldKey(coordinate('999999999999999999999'), {
      kind: 'gallery', gallery: coordinate('-888888888888888888888'),
    })).toBe('999999999999999999999:gallery:-888888888888888888888')
  })
})
