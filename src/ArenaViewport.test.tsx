import { describe, expect, it } from 'vitest'
import { FIRST_PERSON_CAMERA_ORDER, cameraYawFromPlayerYaw } from './lib/camera'

describe('ArenaViewport camera orientation', () => {
  it('renders the camera yaw so forward movement matches the visible direction', () => {
    expect(cameraYawFromPlayerYaw(0)).toBe(-0)
    expect(cameraYawFromPlayerYaw(Math.PI / 2)).toBe(-Math.PI / 2)
    expect(cameraYawFromPlayerYaw(Math.PI)).toBe(-Math.PI)
  })

  it('keeps first-person pitch and yaw stable without introducing camera roll', () => {
    expect(FIRST_PERSON_CAMERA_ORDER).toBe('YXZ')
  })
})
