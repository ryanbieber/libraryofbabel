import { addCoordinate, coordinate, serializeCoordinate, signedCoordinateLabel, type Coordinate } from './coordinate'

export type FloorCoordinate = Coordinate
export type GalleryCoordinate = Coordinate
export type ConnectorCoordinate = Coordinate

// Transitional aliases keep the domain names concise at call sites.
export type FloorIndex = FloorCoordinate
export type GalleryIndex = GalleryCoordinate
export type ConnectorIndex = ConnectorCoordinate
export type ServiceRoomKind = 'sleeping' | 'latrine'

// The legacy sector remains useful for compatibility tests and the finite word index.
export const LEGACY_FLOOR_COORDINATES = [coordinate(-1), coordinate(0), coordinate(1)] as const
export const LEGACY_GALLERY_COORDINATES = [coordinate(-2), coordinate(-1), coordinate(0), coordinate(1), coordinate(2)] as const
export const LEGACY_CONNECTOR_COORDINATES = [coordinate(-3), coordinate(-2), coordinate(-1), coordinate(0), coordinate(1), coordinate(2)] as const

export type WorldZone =
  | { kind: 'gallery'; gallery: GalleryCoordinate }
  | { kind: 'vestibule'; connector: ConnectorCoordinate }
  | { kind: 'service'; connector: ConnectorCoordinate; room: ServiceRoomKind }
  | { kind: 'stair'; connector: ConnectorCoordinate; from: FloorCoordinate; to: FloorCoordinate; distance: number }

export const STARTING_FLOOR: FloorCoordinate = coordinate(0)
export const STARTING_GALLERY: GalleryCoordinate = coordinate(0)

export function isFloorIndex(value: unknown): value is FloorCoordinate {
  return typeof value === 'bigint'
}

export function isGalleryIndex(value: unknown): value is GalleryCoordinate {
  return typeof value === 'bigint'
}

export function isConnectorIndex(value: unknown): value is ConnectorCoordinate {
  return typeof value === 'bigint'
}

export function northConnector(gallery: GalleryCoordinate): ConnectorCoordinate {
  return addCoordinate(gallery, -1)
}

export function southConnector(gallery: GalleryCoordinate): ConnectorCoordinate {
  return gallery
}

export function galleriesForConnector(connector: ConnectorCoordinate): {
  north: GalleryCoordinate
  south: GalleryCoordinate
} {
  return { north: connector, south: addCoordinate(connector, 1) }
}

export function adjacentFloor(floor: FloorCoordinate, direction: -1 | 1): FloorCoordinate {
  return addCoordinate(floor, direction)
}

export function zoneLabel(zone: WorldZone): string {
  switch (zone.kind) {
    case 'gallery':
      return `gallery ${signedLabel(zone.gallery)}`
    case 'vestibule':
      return `vestibule ${signedLabel(zone.connector)}`
    case 'service':
      return zone.room === 'sleeping' ? 'sleeping closet' : 'latrine'
    case 'stair':
      return 'spiral stair'
  }
}

export function worldKey(floor: FloorCoordinate, zone: WorldZone): string {
  const floorKey = serializeCoordinate(floor)
  if (zone.kind === 'gallery') return `${floorKey}:gallery:${serializeCoordinate(zone.gallery)}`
  if (zone.kind === 'service') return `${floorKey}:${zone.room}:${serializeCoordinate(zone.connector)}`
  return `${floorKey}:${zone.kind}:${serializeCoordinate(zone.connector)}`
}

export const signedLabel = signedCoordinateLabel
