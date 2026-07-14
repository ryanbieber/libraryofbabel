import type { RoomKind } from './level'

type Rgb = readonly [number, number, number]
type TableAccessory = 'archive-ledgers' | 'display-case' | 'open-books'

export type RoomVisualProfile = {
  shelf: {
    woodColor: string
    boardColor: string
    backHeight: number
    verticalStart: number
    verticalStep: number
    bookWidthScale: number
    bookHeightBase: number
    bookHeightStep: number
    bookDepth: number
    bookPalette: readonly string[]
  }
  table: {
    position: [number, number, number]
    rotationY: number
    scale: [number, number, number]
    topColor: string
    legColor: string
    accessory: TableAccessory
  }
  lighting: {
    background: string
    fog: string
    fogNear: number
    fogFar: number
    ambientIntensity: number
    mainColor: string
    mainIntensity: number
    accentColor: string
    accentIntensity: number
  }
  plaque: {
    positions: readonly number[]
    y: number
    width: number
    height: number
    color: string
    frameColor: string
    lineColor: string
  }
  dust: {
    count: number
    opacity: number
    color: string
    size: number
    speed: number
  }
  rug: {
    color: string
    width: number
    depth: number
    rotation: number
  }
  texture: {
    wallBrick: Rgb
    wallMortar: Rgb
    floorTile: Rgb
    floorSeam: Rgb
    ceilingTile: Rgb
    ceilingSeam: Rgb
    noise: number
  }
}

const roomVisualProfiles = {
  archive: {
    shelf: {
      woodColor: '#24140c',
      boardColor: '#5b3219',
      backHeight: 2.02,
      verticalStart: 0.78,
      verticalStep: 0.3,
      bookWidthScale: 0.84,
      bookHeightBase: 0.23,
      bookHeightStep: 0.025,
      bookDepth: 0.16,
      bookPalette: ['#5d3321', '#463623', '#6d4a27', '#4a2f34', '#3d4b35', '#6a582d'],
    },
    table: {
      position: [1.04, 0.54, -1.18],
      rotationY: -0.22,
      scale: [0.86, 1, 0.8],
      topColor: '#3b2114',
      legColor: '#1b0e08',
      accessory: 'archive-ledgers',
    },
    lighting: {
      background: '#0b0908',
      fog: '#0b0908',
      fogNear: 2.8,
      fogFar: 8.2,
      ambientIntensity: 0.44,
      mainColor: '#bf8642',
      mainIntensity: 9.5,
      accentColor: '#d89a4a',
      accentIntensity: 3.2,
    },
    plaque: {
      positions: [-1.18, 1.18],
      y: 2.56,
      width: 0.42,
      height: 0.24,
      color: '#b48942',
      frameColor: '#5a3517',
      lineColor: '#3a210e',
    },
    dust: {
      count: 76,
      opacity: 0.32,
      color: '#caa672',
      size: 0.034,
      speed: 0.36,
    },
    rug: {
      color: '#5f0b0f',
      width: 1.64,
      depth: 2.55,
      rotation: -0.08,
    },
    texture: {
      wallBrick: [83, 76, 68],
      wallMortar: [31, 28, 27],
      floorTile: [51, 43, 36],
      floorSeam: [24, 22, 22],
      ceilingTile: [91, 83, 74],
      ceilingSeam: [38, 35, 33],
      noise: 25,
    },
  },
  gallery: {
    shelf: {
      woodColor: '#463622',
      boardColor: '#8b6b3d',
      backHeight: 1.56,
      verticalStart: 0.62,
      verticalStep: 0.42,
      bookWidthScale: 0.54,
      bookHeightBase: 0.16,
      bookHeightStep: 0.028,
      bookDepth: 0.1,
      bookPalette: ['#9b6a34', '#6f7750', '#7f4d58', '#c29b45', '#3f7082', '#75634a'],
    },
    table: {
      position: [0, 0.54, -0.52],
      rotationY: 0,
      scale: [1.18, 1, 0.72],
      topColor: '#5a3c20',
      legColor: '#2d1d0f',
      accessory: 'display-case',
    },
    lighting: {
      background: '#0a0c0f',
      fog: '#111820',
      fogNear: 4.6,
      fogFar: 12.6,
      ambientIntensity: 0.68,
      mainColor: '#efe4c4',
      mainIntensity: 12,
      accentColor: '#79c6db',
      accentIntensity: 5.6,
    },
    plaque: {
      positions: [0],
      y: 2.58,
      width: 0.76,
      height: 0.34,
      color: '#d7ceb0',
      frameColor: '#9a7a3f',
      lineColor: '#6a4d22',
    },
    dust: {
      count: 18,
      opacity: 0.12,
      color: '#d9eff2',
      size: 0.026,
      speed: 0.22,
    },
    rug: {
      color: '#1f4d59',
      width: 2,
      depth: 2.2,
      rotation: 0,
    },
    texture: {
      wallBrick: [106, 111, 119],
      wallMortar: [42, 45, 52],
      floorTile: [66, 63, 55],
      floorSeam: [32, 34, 38],
      ceilingTile: [126, 128, 132],
      ceilingSeam: [48, 51, 57],
      noise: 23,
    },
  },
  stack: {
    shelf: {
      woodColor: '#351d0f',
      boardColor: '#6d3a18',
      backHeight: 1.86,
      verticalStart: 0.7,
      verticalStep: 0.34,
      bookWidthScale: 0.72,
      bookHeightBase: 0.2,
      bookHeightStep: 0.034,
      bookDepth: 0.13,
      bookPalette: ['#8f5224', '#536b42', '#72394b', '#b08a35', '#325a67', '#6c5434'],
    },
    table: {
      position: [0, 0.54, -1.25],
      rotationY: 0,
      scale: [1, 1, 1],
      topColor: '#4a2814',
      legColor: '#2a150a',
      accessory: 'open-books',
    },
    lighting: {
      background: '#09090b',
      fog: '#09090b',
      fogNear: 3.6,
      fogFar: 10.8,
      ambientIntensity: 0.54,
      mainColor: '#d5c3a3',
      mainIntensity: 11,
      accentColor: '#1ed2c3',
      accentIntensity: 4.5,
    },
    plaque: {
      positions: [-1.42, 1.42],
      y: 2.5,
      width: 0.32,
      height: 0.16,
      color: '#cba251',
      frameColor: '#5f3516',
      lineColor: '#3d210d',
    },
    dust: {
      count: 36,
      opacity: 0.2,
      color: '#d0b37a',
      size: 0.028,
      speed: 0.28,
    },
    rug: {
      color: '#8e0e12',
      width: 1.8,
      depth: 2.8,
      rotation: 0,
    },
    texture: {
      wallBrick: [96, 100, 112],
      wallMortar: [34, 36, 44],
      floorTile: [58, 55, 50],
      floorSeam: [28, 29, 34],
      ceilingTile: [112, 113, 118],
      ceilingSeam: [42, 43, 49],
      noise: 29,
    },
  },
} as const satisfies Record<RoomKind, RoomVisualProfile>

export function roomVisualProfile(kind: RoomKind): RoomVisualProfile {
  return roomVisualProfiles[kind]
}
