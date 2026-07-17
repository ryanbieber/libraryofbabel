// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { coordinate } from './coordinate'
import { movePose, STARTING_PLAYER_POSE, STAIR_TRAVEL_DISTANCE, VESTIBULE_HALF_DEPTH, type PlayerPose } from './roomGeometry'
import { SAVE_KEY, readSavedGame, writeSavedGame } from './saveGame'

describe('long unbounded navigation QA', () => {
  it('crosses hundreds of galleries in both signed directions', () => {
    let south: PlayerPose = {
      ...STARTING_PLAYER_POSE,
      zone: { kind: 'vestibule', connector: coordinate(2) },
      x: 0,
      z: VESTIBULE_HALF_DEPTH - 0.05,
      yaw: Math.PI,
    }
    for (let index = 0; index < 250; index += 1) {
      const gallery = movePose({ ...south, x: 0, z: VESTIBULE_HALF_DEPTH - 0.05, yaw: Math.PI }, 1, 0, 0.25).pose
      if (gallery.zone.kind !== 'gallery') throw new Error('Expected south gallery')
      south = movePose({ ...gallery, x: 0, z: -5.08, yaw: Math.PI }, 1, 0, 11).pose
    }
    expect(south.zone).toEqual({ kind: 'vestibule', connector: 252n })

    let north: PlayerPose = {
      ...STARTING_PLAYER_POSE,
      zone: { kind: 'vestibule', connector: coordinate(-3) },
      x: 0,
      z: -VESTIBULE_HALF_DEPTH + 0.05,
      yaw: 0,
    }
    for (let index = 0; index < 250; index += 1) {
      const gallery = movePose({ ...north, x: 0, z: -VESTIBULE_HALF_DEPTH + 0.05, yaw: 0 }, 1, 0, 0.25).pose
      if (gallery.zone.kind !== 'gallery') throw new Error('Expected north gallery')
      north = movePose({ ...gallery, x: 0, z: 5.08, yaw: 0 }, 1, 0, 11).pose
    }
    expect(north.zone).toEqual({ kind: 'vestibule', connector: -253n })
  })

  it('climbs and descends hundreds of floors, then saves and reloads exactly', () => {
    let pose = STARTING_PLAYER_POSE
    for (let index = 0; index < 160; index += 1) pose = travelFloor(pose.floor, 1)
    expect(pose.floor).toBe(160n)
    for (let index = 0; index < 320; index += 1) pose = travelFloor(pose.floor, -1)
    expect(pose.floor).toBe(-160n)

    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }
    const game = { ...readDefault(), pose }
    writeSavedGame(game, storage)
    expect(values.get(SAVE_KEY)).toContain('"floor":"-160"')
    expect(readSavedGame(storage)).toEqual(game)
  })
})

function travelFloor(floor: PlayerPose['floor'], direction: -1 | 1): PlayerPose {
  const vestibule: PlayerPose = {
    ...STARTING_PLAYER_POSE,
    floor,
    zone: { kind: 'vestibule', connector: coordinate(0) },
    x: 2.55,
    z: direction === 1 ? -0.4 : 0.4,
    yaw: Math.PI / 2,
  }
  const entered = movePose(vestibule, 1, 0, 0.3)
  if (entered.pose.zone.kind !== 'stair') throw new Error('Expected stair')
  return movePose(entered.pose, 1, 0, STAIR_TRAVEL_DISTANCE + 0.1).pose
}

function readDefault() {
  return {
    version: 2 as const,
    pose: STARTING_PLAYER_POSE,
    selectedBook: { floor: coordinate(0), gallery: coordinate(0), wall: 'A' as const, shelf: 1, book: 7 },
    questStatus: 'accepted' as const,
    wordFinding: null,
  }
}
