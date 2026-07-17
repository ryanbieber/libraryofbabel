export type ScenePosition = readonly [x: number, y: number, z: number]

export const GALLERY_BULB_POSITIONS = [
  [-2.25, 2.5, 0],
  [2.25, 2.5, 0],
] as const satisfies readonly ScenePosition[]

export const VESTIBULE_MIRROR_POSITION = [-2.56, 1.55, 0] as const satisfies ScenePosition

