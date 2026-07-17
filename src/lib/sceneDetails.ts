import { BOOKS_PER_SHELF } from './library'

export type ScenePosition = readonly [x: number, y: number, z: number]

export const GALLERY_BULB_POSITIONS = [
  [-2.25, 2.5, 0],
  [2.25, 2.5, 0],
] as const satisfies readonly ScenePosition[]

export const VESTIBULE_MIRROR_POSITION = [-2.56, 1.55, 0] as const satisfies ScenePosition

export const BOOK_SCALE_LABELS = [1, 8, 16, 24, 32] as const
export const SHELF_LABEL_ROTATION: [number, number, number] = [0, Math.PI, 0]

export function bookScaleLabelFraction(book: number): number {
  return (book - 0.5) / BOOKS_PER_SHELF
}
