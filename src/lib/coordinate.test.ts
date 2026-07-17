import { describe, expect, it } from 'vitest'
import {
  addCoordinate,
  compareCoordinates,
  coordinate,
  coordinateFromLegacyNumber,
  parseCoordinate,
  serializeCoordinate,
  signedCoordinateLabel,
} from './coordinate'

describe('global coordinates', () => {
  it('represents signed coordinates far beyond Number safe integer range', () => {
    const huge = coordinate('999999999999999999999999999999999999999999999999')
    expect(serializeCoordinate(addCoordinate(huge, 1))).toBe('1000000000000000000000000000000000000000000000000')
    expect(serializeCoordinate(addCoordinate(coordinate('-999999999999999999999999'), -1))).toBe('-1000000000000000000000000')
  })

  it('accepts only canonical decimal strings at persistence boundaries', () => {
    expect(parseCoordinate('0')).toBe(0n)
    expect(parseCoordinate('-42')).toBe(-42n)
    for (const invalid of ['', '+1', '-0', '01', '-01', '1.0', '1e3', 1, null]) {
      expect(parseCoordinate(invalid)).toBeNull()
    }
  })

  it('rejects unsafe legacy numbers and compares without number conversion', () => {
    expect(coordinateFromLegacyNumber(Number.MAX_SAFE_INTEGER)).toBe(BigInt(Number.MAX_SAFE_INTEGER))
    expect(coordinateFromLegacyNumber(Number.MAX_SAFE_INTEGER + 1)).toBeNull()
    expect(compareCoordinates(coordinate('-9007199254740993'), coordinate('9007199254740993'))).toBe(-1)
  })

  it('formats arbitrarily large signed labels', () => {
    expect(signedCoordinateLabel(coordinate('12345678901234567890'))).toBe('+12345678901234567890')
    expect(signedCoordinateLabel(coordinate('-12345678901234567890'))).toBe('-12345678901234567890')
    expect(signedCoordinateLabel(coordinate(0))).toBe('0')
  })
})
