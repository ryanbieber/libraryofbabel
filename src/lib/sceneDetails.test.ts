import { describe, expect, it } from 'vitest'
import { GALLERY_BULB_POSITIONS, VESTIBULE_MIRROR_POSITION } from './sceneDetails'

describe('authored scene details', () => {
  it('places exactly two visible gallery bulbs crosswise', () => {
    expect(GALLERY_BULB_POSITIONS).toHaveLength(2)
    expect(GALLERY_BULB_POSITIONS[0][0]).toBe(-GALLERY_BULB_POSITIONS[1][0])
    expect(GALLERY_BULB_POSITIONS[0][1]).toBe(GALLERY_BULB_POSITIONS[1][1])
    expect(GALLERY_BULB_POSITIONS[0][2]).toBe(0)
    expect(GALLERY_BULB_POSITIONS[1][2]).toBe(0)
  })

  it('keeps the important mirror centered on the vestibule wall', () => {
    expect(VESTIBULE_MIRROR_POSITION[0]).toBeLessThan(-2.5)
    expect(VESTIBULE_MIRROR_POSITION[2]).toBe(0)
  })
})

