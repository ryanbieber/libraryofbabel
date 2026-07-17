import { describe, expect, it } from 'vitest'
import { incidentForGallery, INCIDENT_KINDS } from './incidents'
import { LEGACY_FLOOR_COORDINATES, LEGACY_GALLERY_COORDINATES } from './level'
import { coordinate } from './coordinate'

const galleryCoordinates = LEGACY_FLOOR_COORDINATES.flatMap((floor) => (
  LEGACY_GALLERY_COORDINATES.map((gallery) => ({ floor, gallery }))
))

describe('deterministic gallery incidents', () => {
  it('assigns the same incident to the same stable world-zone key', () => {
    galleryCoordinates.forEach(({ floor, gallery }) => {
      expect(incidentForGallery(floor, gallery)).toEqual(incidentForGallery(floor, gallery))
    })
  })

  it('leaves most galleries empty while making every initial incident reachable', () => {
    const incidents = galleryCoordinates
      .map(({ floor, gallery }) => incidentForGallery(floor, gallery))
      .filter((incident) => incident !== null)

    expect(incidents.length).toBeLessThan(galleryCoordinates.length / 2)
    expect(incidents.map(({ kind }) => kind).sort()).toEqual([...INCIDENT_KINDS].sort())
  })

  it('always excludes the starting gallery so its quest NPCs remain legible', () => {
    expect(incidentForGallery(coordinate(0), coordinate(0))).toBeNull()
  })

  it('is stable across JSON serialization without adding mutable save state', () => {
    galleryCoordinates.forEach(({ floor, gallery }) => {
      const incident = incidentForGallery(floor, gallery)
      expect(JSON.parse(JSON.stringify(incident))).toEqual(incident)
    })
  })
})
