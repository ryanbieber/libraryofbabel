export const STAIR_SHAFT_RADIUS = 2.55
export const STAIR_TRACK_RADIUS = 1.38
export const STAIR_HANDRAIL_RADIUS = 2.05
export const STAIR_TREAD_WIDTH = 1.45
export const STAIR_TREAD_DEPTH = 0.42

// The last tread of each flight becomes a broad threshold that reaches from
// the portal to the first regular tread of the next flight.
export const STAIR_LANDING_RADIUS = 1.75
export const STAIR_LANDING_DEPTH = 1.26

// Remove the outer rail around the west-facing landing so the vestibule view
// reads as an open walk-on entrance instead of an unbroken spiral barrier.
export const STAIR_ENTRANCE_RAIL_GAP_FRACTION = 0.07

export function isStairEntranceGap(trackFraction: number): boolean {
  return Math.min(trackFraction, 1 - trackFraction) <= STAIR_ENTRANCE_RAIL_GAP_FRACTION
}
