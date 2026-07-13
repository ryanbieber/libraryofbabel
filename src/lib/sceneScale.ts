export const ROOM_HEIGHT = 3.08
export const PLAYER_EYE_HEIGHT = 1.6
export const STANDARD_DOORWAY_HEIGHT = 2.12
export const COMPACT_DOORWAY_HEIGHT = 2.06

export const SEATED_MONK_SCALE = 1.26
export const SEATED_MONK_VISIBLE_MIN_Y = -0.35
export const SEATED_MONK_VISIBLE_MAX_Y = 0.99
export const SEATED_MONK_BASE_Y = -SEATED_MONK_VISIBLE_MIN_Y * SEATED_MONK_SCALE

export function doorwayLocalY(height: number, parentCenterY: number): number {
  return height / 2 - parentCenterY
}

export function doorwayWorldBounds(height: number, parentCenterY: number) {
  const localY = doorwayLocalY(height, parentCenterY)
  const centerY = parentCenterY + localY
  return {
    localY,
    bottom: centerY - height / 2,
    top: centerY + height / 2,
  }
}

export function seatedMonkWorldBounds(
  scale = SEATED_MONK_SCALE,
  baseY = -SEATED_MONK_VISIBLE_MIN_Y * scale,
) {
  return {
    bottom: baseY + SEATED_MONK_VISIBLE_MIN_Y * scale,
    top: baseY + SEATED_MONK_VISIBLE_MAX_Y * scale,
  }
}
