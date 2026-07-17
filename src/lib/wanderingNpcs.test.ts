import { describe, expect, it } from 'vitest'
import { coordinate } from './coordinate'
import { incidentForGallery } from './incidents'
import { GALLERY_RADIUS, LIGHTWELL_RADIUS } from './roomGeometry'
import {
  WANDERING_ARCHETYPES,
  WANDERING_ROUTE_IDS,
  npcForGallery,
  npcsForGallery,
  wanderingNpcForGallery,
  wanderingNpcPoseAt,
} from './npcs'

describe('ambient wandering readers', () => {
  it('derives uncommon assignments and every presentation choice from a stable gallery key', () => {
    const assigned = Array.from({ length: 600 }, (_, value) => wanderingNpcForGallery(coordinate(7), coordinate(value)))
      .filter((npc) => npc !== null)

    expect(assigned.length).toBeGreaterThan(20)
    expect(assigned.length).toBeLessThan(80)
    for (const npc of assigned) {
      expect(wanderingNpcForGallery(npc.floor, npc.gallery)).toEqual(npc)
      expect(npc.wandering?.worldZoneKey).toBe(`${npc.floor}:gallery:${npc.gallery}`)
      expect(npc.quest).toBe('ambient')
      expect(npc.dialogue.length).toBeLessThanOrEqual(2)
    }
  })

  it('never shares the starting gallery, an incident, or an existing resident NPC', () => {
    expect(wanderingNpcForGallery(coordinate(0), coordinate(0))).toBeNull()

    for (let value = -150; value <= 150; value += 1) {
      const floor = coordinate(3)
      const gallery = coordinate(value)
      const wanderer = wanderingNpcForGallery(floor, gallery)
      if (npcForGallery(floor, gallery) || incidentForGallery(floor, gallery)) expect(wanderer).toBeNull()
      expect(npcsForGallery(floor, gallery).length).toBeLessThanOrEqual(1)
    }
  })

  it('reuses the small archetype and route sets instead of inventing gallery-specific content', () => {
    const archetypes = new Set<string>()
    const routes = new Set<string>()
    for (let value = -2_000; value <= 2_000; value += 1) {
      const npc = wanderingNpcForGallery(coordinate(-11), coordinate(value))
      if (!npc?.wandering || npc.wandering.archetype === 'knowledge-garage-reader') continue
      archetypes.add(npc.wandering.archetype)
      routes.add(npc.wandering.route)
    }

    expect([...archetypes].sort()).toEqual([...WANDERING_ARCHETYPES].sort())
    expect([...routes].sort()).toEqual([...WANDERING_ROUTE_IDS].sort())
  })

  it('keeps every reusable route clear of the shaft, reading table, shelf faces, and door lane', () => {
    const npcByRoute = new Map<string, NonNullable<ReturnType<typeof wanderingNpcForGallery>>>()
    for (let value = 0; value < 8_000 && npcByRoute.size < WANDERING_ROUTE_IDS.length; value += 1) {
      const npc = wanderingNpcForGallery(coordinate(23), coordinate(value))
      if (npc?.wandering) npcByRoute.set(npc.wandering.route, npc)
    }
    expect([...npcByRoute.keys()].sort()).toEqual([...WANDERING_ROUTE_IDS].sort())

    for (const npc of npcByRoute.values()) {
      const distinctPositions = new Set<string>()
      for (let tick = 0; tick <= 2_400; tick += 1) {
        const { position } = wanderingNpcPoseAt(npc, tick / 4)
        distinctPositions.add(`${position.x.toFixed(2)}:${position.z.toFixed(2)}`)
        expect(Math.hypot(position.x, position.z)).toBeGreaterThan(LIGHTWELL_RADIUS + 0.5)
        expect(Math.hypot(position.x + 2.35, position.z - 0.65)).toBeGreaterThan(1.5)
        expect(GALLERY_RADIUS - Math.abs(position.z) / Math.sqrt(3) - Math.abs(position.x)).toBeGreaterThan(0.7)
        expect(Math.abs(position.z)).toBeLessThanOrEqual(3.2)
        expect(position.x).toBeGreaterThanOrEqual(1.7)
      }
      expect(distinctPositions.size).toBeGreaterThan(30)
    }
  })

  it('makes the transformed knowledge-and-Lamborghini reader exceptionally rare and noncanonical', () => {
    const homages = []
    let ambientCount = 0
    for (let value = 0; value < 100_000; value += 1) {
      const npc = wanderingNpcForGallery(coordinate(101), coordinate(value))
      if (!npc?.wandering) continue
      ambientCount += 1
      if (npc.wandering.archetype === 'knowledge-garage-reader') homages.push(npc)
    }

    expect(homages.length).toBeGreaterThan(0)
    expect(homages.length).toBeLessThan(50)
    expect(ambientCount / homages.length).toBeGreaterThan(300)
    for (const homage of homages) {
      const dialogue = homage.dialogue.join(' ')
      expect(dialogue).toMatch(/knowledge/i)
      expect(dialogue).toMatch(/Lamborghinis/i)
      expect(dialogue).toMatch(/garage/i)
      expect(`${homage.name} ${dialogue}`).not.toMatch(/Tai Lopez/i)
      expect(homage.quest).toBe('ambient')
    }
  })
})
