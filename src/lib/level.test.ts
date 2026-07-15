import { describe, expect, it } from 'vitest'
import {
  CONNECTOR_INDICES,
  FLOOR_INDICES,
  GALLERY_INDICES,
  adjacentFloor,
  galleriesForConnector,
  northConnector,
  southConnector,
  worldKey,
} from './level'

describe('hexagonal library topology', () => {
  it('defines fifteen galleries across three floors', () => {
    expect(FLOOR_INDICES).toEqual([-1, 0, 1])
    expect(GALLERY_INDICES).toEqual([-2, -1, 0, 1, 2])
    expect(FLOOR_INDICES.length * GALLERY_INDICES.length).toBe(15)
  })

  it('places six shared or terminal vestibules along each procession', () => {
    expect(CONNECTOR_INDICES).toEqual([-3, -2, -1, 0, 1, 2])
    expect(northConnector(0)).toBe(-1)
    expect(southConnector(0)).toBe(0)
    expect(galleriesForConnector(-1)).toEqual({ north: -1, south: 0 })
    expect(galleriesForConnector(-3)).toEqual({ north: null, south: -2 })
    expect(galleriesForConnector(2)).toEqual({ north: 2, south: null })
  })

  it('blocks floors beyond the authored three-level area', () => {
    expect(adjacentFloor(-1, -1)).toBeNull()
    expect(adjacentFloor(-1, 1)).toBe(0)
    expect(adjacentFloor(0, 1)).toBe(1)
    expect(adjacentFloor(1, 1)).toBeNull()
  })

  it('uses stable keys for autosave and deterministic placement', () => {
    expect(worldKey(0, { kind: 'gallery', gallery: 0 })).toBe('0:gallery:0')
    expect(worldKey(-1, { kind: 'service', connector: -2, room: 'sleeping' })).toBe('-1:sleeping:-2')
  })

  it('keeps all fifteen gallery coordinates connected by passages and stairs', () => {
    const nodes = FLOOR_INDICES.flatMap((floor) => GALLERY_INDICES.map((gallery) => `${floor}:${gallery}`))
    const seen = new Set<string>(['0:0'])
    const queue = ['0:0']
    while (queue.length) {
      const [floor, gallery] = queue.shift()!.split(':').map(Number)
      const neighbors = [
        GALLERY_INDICES.includes((gallery - 1) as never) ? `${floor}:${gallery - 1}` : null,
        GALLERY_INDICES.includes((gallery + 1) as never) ? `${floor}:${gallery + 1}` : null,
        FLOOR_INDICES.includes((floor - 1) as never) ? `${floor - 1}:${gallery}` : null,
        FLOOR_INDICES.includes((floor + 1) as never) ? `${floor + 1}:${gallery}` : null,
      ].filter((value): value is string => value !== null)
      for (const neighbor of neighbors) {
        if (!seen.has(neighbor)) { seen.add(neighbor); queue.push(neighbor) }
      }
    }
    expect([...seen].sort()).toEqual(nodes.sort())
  })
})
