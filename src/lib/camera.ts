export const FIRST_PERSON_CAMERA_ORDER = 'YXZ' as const

export function cameraYawFromPlayerYaw(yaw: number): number {
  return -yaw
}
