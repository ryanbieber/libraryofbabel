import {
  adjacentFloor,
  galleriesForConnector,
  northConnector,
  southConnector,
  type FloorIndex,
  type WorldZone,
} from './level'
import {
  FLOOR_HEIGHT,
  GALLERY_APOTHEM,
  VESTIBULE_HALF_DEPTH,
  VESTIBULE_HALF_WIDTH,
  type PlayerPose,
} from './roomGeometry'

export type VisibleScene = {
  id: string
  floor: FloorIndex
  zone: WorldZone
  position: [number, number, number]
  isCurrent: boolean
}

const GALLERY_VESTIBULE_DISTANCE = GALLERY_APOTHEM + VESTIBULE_HALF_DEPTH
const SERVICE_VESTIBULE_DISTANCE = VESTIBULE_HALF_WIDTH + 1.8
const SERVICE_ROOM_Z_OFFSET = 1.4
const STAIR_VESTIBULE_DISTANCE = VESTIBULE_HALF_WIDTH + 2.55

export function visibleScenesForPose(pose: PlayerPose): VisibleScene[] {
  const current = scene('current', pose.floor, pose.zone, [0, 0, 0], true)

  switch (pose.zone.kind) {
    case 'gallery':
      return [
        current,
        scene('north-vestibule', pose.floor, { kind: 'vestibule', connector: northConnector(pose.zone.gallery) }, [0, 0, -GALLERY_VESTIBULE_DISTANCE]),
        scene('south-vestibule', pose.floor, { kind: 'vestibule', connector: southConnector(pose.zone.gallery) }, [0, 0, GALLERY_VESTIBULE_DISTANCE]),
      ]
    case 'vestibule':
      return visibleFromVestibule(pose, current)
    case 'service': {
      const vestibuleZ = pose.zone.room === 'sleeping' ? SERVICE_ROOM_Z_OFFSET : -SERVICE_ROOM_Z_OFFSET
      return [
        current,
        scene('vestibule', pose.floor, { kind: 'vestibule', connector: pose.zone.connector }, [SERVICE_VESTIBULE_DISTANCE, 0, vestibuleZ]),
      ]
    }
    case 'stair': {
      const ascending = pose.zone.to > pose.zone.from
      return [
        current,
        scene('from-vestibule', pose.zone.from, { kind: 'vestibule', connector: pose.zone.connector }, [-STAIR_VESTIBULE_DISTANCE, ascending ? 0 : FLOOR_HEIGHT, 0]),
        scene('to-vestibule', pose.zone.to, { kind: 'vestibule', connector: pose.zone.connector }, [-STAIR_VESTIBULE_DISTANCE, ascending ? FLOOR_HEIGHT : 0, 0]),
      ]
    }
  }
}

function visibleFromVestibule(pose: PlayerPose, current: VisibleScene): VisibleScene[] {
  if (pose.zone.kind !== 'vestibule') return [current]
  const connector = pose.zone.connector
  const neighbors = galleriesForConnector(connector)
  const scenes = [current]

  if (neighbors.north !== null) {
    scenes.push(scene('north-gallery', pose.floor, { kind: 'gallery', gallery: neighbors.north }, [0, 0, -GALLERY_VESTIBULE_DISTANCE]))
  }
  if (neighbors.south !== null) {
    scenes.push(scene('south-gallery', pose.floor, { kind: 'gallery', gallery: neighbors.south }, [0, 0, GALLERY_VESTIBULE_DISTANCE]))
  }

  scenes.push(
    scene('sleeping-room', pose.floor, { kind: 'service', connector, room: 'sleeping' }, [-SERVICE_VESTIBULE_DISTANCE, 0, -SERVICE_ROOM_Z_OFFSET]),
    scene('latrine', pose.floor, { kind: 'service', connector, room: 'latrine' }, [-SERVICE_VESTIBULE_DISTANCE, 0, SERVICE_ROOM_Z_OFFSET]),
  )

  const stairDirection: -1 | 1 = pose.floor === -1 ? 1 : pose.floor === 1 ? -1 : pose.z <= 0 ? 1 : -1
  const stairFloor = adjacentFloor(pose.floor, stairDirection)
  if (stairFloor !== null) {
    scenes.push(scene(
      'stair',
      pose.floor,
      { kind: 'stair', connector, from: pose.floor, to: stairFloor, distance: 0 },
      [STAIR_VESTIBULE_DISTANCE, 0, 0],
    ))
  }

  return scenes
}

function scene(
  id: string,
  floor: FloorIndex,
  zone: WorldZone,
  position: [number, number, number],
  isCurrent = false,
): VisibleScene {
  return { id, floor, zone, position, isCurrent }
}

export const MAX_VISIBLE_SCENES = 6
