export const FLOOR_INDICES = [-1, 0, 1] as const
export const GALLERY_INDICES = [-2, -1, 0, 1, 2] as const
export const CONNECTOR_INDICES = [-3, -2, -1, 0, 1, 2] as const

export type FloorIndex = (typeof FLOOR_INDICES)[number]
export type GalleryIndex = (typeof GALLERY_INDICES)[number]
export type ConnectorIndex = (typeof CONNECTOR_INDICES)[number]
export type ServiceRoomKind = 'sleeping' | 'latrine'

export type WorldZone =
  | { kind: 'gallery'; gallery: GalleryIndex }
  | { kind: 'vestibule'; connector: ConnectorIndex }
  | { kind: 'service'; connector: ConnectorIndex; room: ServiceRoomKind }
  | { kind: 'stair'; connector: ConnectorIndex; from: FloorIndex; to: FloorIndex; distance: number }

export const STARTING_FLOOR: FloorIndex = 0
export const STARTING_GALLERY: GalleryIndex = 0

export function isFloorIndex(value: number): value is FloorIndex {
  return FLOOR_INDICES.includes(value as FloorIndex)
}

export function isGalleryIndex(value: number): value is GalleryIndex {
  return GALLERY_INDICES.includes(value as GalleryIndex)
}

export function isConnectorIndex(value: number): value is ConnectorIndex {
  return CONNECTOR_INDICES.includes(value as ConnectorIndex)
}

export function northConnector(gallery: GalleryIndex): ConnectorIndex {
  return (gallery - 1) as ConnectorIndex
}

export function southConnector(gallery: GalleryIndex): ConnectorIndex {
  return gallery as ConnectorIndex
}

export function galleriesForConnector(connector: ConnectorIndex): {
  north: GalleryIndex | null
  south: GalleryIndex | null
} {
  const north = connector as number
  const south = connector + 1
  return {
    north: isGalleryIndex(north) ? north : null,
    south: isGalleryIndex(south) ? south : null,
  }
}

export function adjacentFloor(floor: FloorIndex, direction: -1 | 1): FloorIndex | null {
  const candidate = floor + direction
  return isFloorIndex(candidate) ? candidate : null
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

export function worldKey(floor: FloorIndex, zone: WorldZone): string {
  if (zone.kind === 'gallery') return `${floor}:gallery:${zone.gallery}`
  if (zone.kind === 'service') return `${floor}:${zone.room}:${zone.connector}`
  return `${floor}:${zone.kind}:${zone.connector}`
}

export function signedLabel(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}
