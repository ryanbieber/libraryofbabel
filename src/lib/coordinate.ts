declare const coordinateBrand: unique symbol

export type Coordinate = bigint & { readonly [coordinateBrand]: 'Coordinate' }

const CANONICAL_COORDINATE = /^(?:0|-?[1-9]\d*)$/

export function coordinate(value: bigint | number | string): Coordinate {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('Coordinate numbers must be safe integers')
    return BigInt(value) as Coordinate
  }
  if (typeof value === 'string') {
    if (!CANONICAL_COORDINATE.test(value)) throw new TypeError('Coordinates must be canonical decimal integers')
    return BigInt(value) as Coordinate
  }
  return value as Coordinate
}

export function parseCoordinate(value: unknown): Coordinate | null {
  if (typeof value !== 'string' || !CANONICAL_COORDINATE.test(value)) return null
  return BigInt(value) as Coordinate
}

export function coordinateFromLegacyNumber(value: unknown): Coordinate | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? coordinate(value) : null
}

export function serializeCoordinate(value: Coordinate): string {
  return value.toString(10)
}

export function addCoordinate(value: Coordinate, amount: bigint | number): Coordinate {
  if (typeof amount === 'number' && !Number.isSafeInteger(amount)) throw new TypeError('Coordinate offsets must be safe integers')
  return (value + BigInt(amount)) as Coordinate
}

export function compareCoordinates(left: Coordinate, right: Coordinate): -1 | 0 | 1 {
  return left < right ? -1 : left > right ? 1 : 0
}

export function signedCoordinateLabel(value: Coordinate): string {
  return value > 0n ? `+${serializeCoordinate(value)}` : serializeCoordinate(value)
}
