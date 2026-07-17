import { describe, expect, it } from 'vitest'
import {
  BOOK_SCALE_LABELS,
  GALLERY_BULB_POSITIONS,
  SHELF_LABEL_ROTATION,
  VESTIBULE_MIRROR_POSITION,
  bookScaleLabelFraction,
} from './sceneDetails'

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

  it('centers every printed shelf number under its actual book', () => {
    expect(BOOK_SCALE_LABELS).toEqual([1, 8, 16, 24, 32])
    expect(bookScaleLabelFraction(1)).toBe(0.5 / 32)
    expect(bookScaleLabelFraction(8)).toBe(7.5 / 32)
    expect(bookScaleLabelFraction(32)).toBe(31.5 / 32)
  })

  it('faces shelf labels into the room instead of exposing mirrored back faces', () => {
    expect(SHELF_LABEL_ROTATION).toEqual([0, Math.PI, 0])
  })
})
