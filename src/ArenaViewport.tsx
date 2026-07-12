import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { cardinalDirections, type DirectionIndex } from './lib/level'
import type { BookAddress } from './lib/library'
import { addressLabel, nearbyBookAddress } from './lib/library'

type MovementCue = 'idle' | 'step' | 'approach' | 'retreat' | 'turn-left' | 'turn-right'
type ViewDistance = 'center' | 'shelf'

type ArenaViewportProps = {
  floor: number
  facing: number
  currentRoom: { q: number; r: number }
  roomName: string
  doors: DirectionIndex[]
  selectedBook: BookAddress
  movementCue: MovementCue
  viewDistance: ViewDistance
  facingLabel: string
  onOpenBook: (address: BookAddress) => void
  onMoveForward: () => void
  onMoveBack: () => void
  onTurnLeft: () => void
  onTurnRight: () => void
}

const bookColumns = 18
const bookRows = 5

export function ArenaViewport({
  floor,
  facing,
  currentRoom,
  roomName,
  doors,
  selectedBook,
  movementCue,
  viewDistance,
  facingLabel,
  onOpenBook,
  onMoveForward,
  onMoveBack,
  onTurnLeft,
  onTurnRight,
}: ArenaViewportProps) {
  const canUseWebGL = useWebGLAvailable()
  const hasFacingDoor = doors.includes(facing as DirectionIndex)
  const visibleBooks = useMemo(
    () =>
      Array.from({ length: bookRows }, (_, shelf) =>
        Array.from({ length: bookColumns }, (_, book) =>
          nearbyBookAddress(currentRoom.q, currentRoom.r, facing, shelf, book),
        ),
      ),
    [currentRoom.q, currentRoom.r, facing],
  )

  return (
    <div className={`arena-viewport movement-${movementCue}`} data-testid="arena-viewport">
      {canUseWebGL ? (
        <Canvas
          camera={{ fov: 54, position: [0, 1.52, 5.8], rotation: [0, 0, 0] }}
          dpr={1}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        >
          <ArenaScene
            floor={floor}
            facing={facing}
            currentRoom={currentRoom}
            hasFacingDoor={hasFacingDoor}
            selectedBook={selectedBook}
            viewDistance={viewDistance}
            onOpenBook={onOpenBook}
          />
        </Canvas>
      ) : (
        <div className="arena-canvas-unavailable" aria-hidden="true" />
      )}

      <div className="viewport-move-zones" aria-label="Viewport movement controls">
        <button type="button" className="viewport-zone viewport-zone-left" aria-label="Turn left" onClick={onTurnLeft} />
        <button type="button" className="viewport-zone viewport-zone-forward" aria-label="Forward" onClick={onMoveForward} />
        <button type="button" className="viewport-zone viewport-zone-right" aria-label="Turn right" onClick={onTurnRight} />
        <button type="button" className="viewport-zone viewport-zone-back" aria-label="Back" onClick={onMoveBack} />
      </div>
      <div className="arena-crosshair" aria-hidden="true" />
      <div className="arena-plaque" aria-hidden="true">
        <strong>Floor {floor}</strong>
        <span>{facingLabel}</span>
      </div>
      <div className="room-label">
        <strong>{roomName}</strong>
        <span>{hasFacingDoor ? `${facingLabel} door` : `${facingLabel} wall`}</span>
      </div>
      <div className="door-strip" aria-label="Room doors">
        {cardinalDirections.map((direction, index) => (
          <span
            key={direction.label}
            className={[
              'door-chip',
              doors.includes(index as DirectionIndex) ? 'available' : 'sealed',
              index === facing ? 'facing' : '',
            ].join(' ')}
          >
            {direction.shortLabel}
          </span>
        ))}
      </div>
      <div className="book-hotspot-grid" aria-label="Visible shelf volumes">
        {visibleBooks.flatMap((row) =>
          row.map((address) => (
            <button
              type="button"
              key={addressLabel(address)}
              className={
                addressLabel(address) === addressLabel(selectedBook)
                  ? 'arena-book-hotspot selected'
                  : 'arena-book-hotspot'
              }
              aria-label={`Open ${addressLabel(address)}`}
              onClick={() => onOpenBook(address)}
            />
          )),
        )}
      </div>
    </div>
  )
}

function ArenaScene({
  floor,
  facing,
  currentRoom,
  hasFacingDoor,
  selectedBook,
  viewDistance,
  onOpenBook,
}: {
  floor: number
  facing: number
  currentRoom: { q: number; r: number }
  hasFacingDoor: boolean
  selectedBook: BookAddress
  viewDistance: ViewDistance
  onOpenBook: (address: BookAddress) => void
}) {
  const textures = useArenaTextures()
  const cameraRig = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    if (!cameraRig.current) return
    const t = clock.elapsedTime
    const targetZ = viewDistance === 'shelf' ? 2.15 : 0
    cameraRig.current.position.z = THREE.MathUtils.lerp(cameraRig.current.position.z, targetZ, 0.12)
    cameraRig.current.position.y = Math.sin(t * 2.4) * 0.018
  })

  return (
    <group ref={cameraRig}>
      <color attach="background" args={['#09090b']} />
      <fog attach="fog" args={['#09090b', 7.4, 14.8]} />
      <ambientLight intensity={0.62} />
      <pointLight color="#d5c3a3" intensity={15} position={[0, 2.4, 1.8]} distance={9} />
      <pointLight color="#1ed2c3" intensity={8} position={[-3.4, 1.9, -4.9]} distance={5} />
      <pointLight color="#1ed2c3" intensity={8} position={[3.4, 1.9, -4.9]} distance={5} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -3.4]}>
        <planeGeometry args={[14, 17]} />
        <meshStandardMaterial map={textures.floor} roughness={1} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 3.08, -3.4]}>
        <planeGeometry args={[14, 17]} />
        <meshStandardMaterial map={textures.ceiling} roughness={1} />
      </mesh>
      <mesh position={[0, 1.54, -8.2]}>
        <planeGeometry args={[8.8, 3.08]} />
        <meshStandardMaterial map={textures.wall} roughness={0.92} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-4.4, 1.54, -3.2]}>
        <planeGeometry args={[10.4, 3.08]} />
        <meshStandardMaterial map={textures.wall} roughness={0.92} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[4.4, 1.54, -3.2]}>
        <planeGeometry args={[10.4, 3.08]} />
        <meshStandardMaterial map={textures.wall} roughness={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, -3.1]}>
        <planeGeometry args={[2.1, 9.4]} />
        <meshStandardMaterial color="#8e0e12" roughness={0.95} />
      </mesh>

      <ReadingTable />
      <Torch position={[-3.5, 1.26, -5.7]} />
      <Torch position={[3.5, 1.26, -5.7]} />
      <ShelfWall
        currentRoom={currentRoom}
        facing={facing}
        hasFacingDoor={hasFacingDoor}
        selectedBook={selectedBook}
        onOpenBook={onOpenBook}
      />
      <Stairs />
      <AddressPlaque floor={floor} facing={facing} />
    </group>
  )
}

function ReadingTable() {
  return (
    <group position={[0, 0.54, -2.25]}>
      <mesh position={[0, 0.24, 0]}>
        <boxGeometry args={[1.9, 0.18, 0.88]} />
        <meshStandardMaterial color="#4a2814" roughness={0.9} />
      </mesh>
      <mesh position={[-0.78, -0.22, -0.3]}>
        <boxGeometry args={[0.16, 0.72, 0.16]} />
        <meshStandardMaterial color="#2a150a" roughness={1} />
      </mesh>
      <mesh position={[0.78, -0.22, -0.3]}>
        <boxGeometry args={[0.16, 0.72, 0.16]} />
        <meshStandardMaterial color="#2a150a" roughness={1} />
      </mesh>
      <mesh position={[-0.78, -0.22, 0.3]}>
        <boxGeometry args={[0.16, 0.72, 0.16]} />
        <meshStandardMaterial color="#2a150a" roughness={1} />
      </mesh>
      <mesh position={[0.78, -0.22, 0.3]}>
        <boxGeometry args={[0.16, 0.72, 0.16]} />
        <meshStandardMaterial color="#2a150a" roughness={1} />
      </mesh>
      <mesh rotation={[-0.18, 0.08, 0]} position={[-0.34, 0.38, 0]}>
        <boxGeometry args={[0.46, 0.04, 0.34]} />
        <meshStandardMaterial color="#d8bd7d" roughness={0.85} />
      </mesh>
      <mesh rotation={[-0.18, -0.08, 0]} position={[0.14, 0.385, 0]}>
        <boxGeometry args={[0.46, 0.04, 0.34]} />
        <meshStandardMaterial color="#ceb170" roughness={0.85} />
      </mesh>
    </group>
  )
}

function ShelfWall({
  currentRoom,
  facing,
  hasFacingDoor,
  selectedBook,
  onOpenBook,
}: {
  currentRoom: { q: number; r: number }
  facing: number
  hasFacingDoor: boolean
  selectedBook: BookAddress
  onOpenBook: (address: BookAddress) => void
}) {
  const shelfWood = useMemo(() => new THREE.Color('#351d0f'), [])

  return (
    <group position={[0, 1.42, -8.04]}>
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[5.9, 1.86, 0.18]} />
        <meshStandardMaterial color={shelfWood} roughness={1} />
      </mesh>
      {hasFacingDoor ? (
        <group position={[0, -0.43, 0.19]}>
          <mesh>
            <boxGeometry args={[0.88, 0.92, 0.1]} />
            <meshStandardMaterial color="#090709" roughness={1} />
          </mesh>
          <mesh position={[0, 0.49, 0.02]}>
            <boxGeometry args={[1.08, 0.12, 0.14]} />
            <meshStandardMaterial color="#806c55" roughness={0.9} />
          </mesh>
          <mesh position={[-0.54, 0, 0.02]}>
            <boxGeometry args={[0.1, 1.02, 0.14]} />
            <meshStandardMaterial color="#806c55" roughness={0.9} />
          </mesh>
          <mesh position={[0.54, 0, 0.02]}>
            <boxGeometry args={[0.1, 1.02, 0.14]} />
            <meshStandardMaterial color="#806c55" roughness={0.9} />
          </mesh>
        </group>
      ) : null}
      {Array.from({ length: bookRows }, (_, shelf) => (
        <group key={shelf} position={[0, 0.7 - shelf * 0.34, 0.1]}>
          <mesh position={[0, -0.16, 0]}>
            <boxGeometry args={[5.94, 0.035, 0.24]} />
            <meshStandardMaterial color="#6d3a18" roughness={1} />
          </mesh>
          {Array.from({ length: bookColumns }, (_, book) => {
            const address = nearbyBookAddress(currentRoom.q, currentRoom.r, facing, shelf, book)
            const isSelected = addressLabel(address) === addressLabel(selectedBook)
            return (
              <BookSpine
                key={`${shelf}:${book}`}
                address={address}
                isSelected={isSelected}
                shelf={shelf}
                book={book}
                onOpenBook={onOpenBook}
              />
            )
          })}
        </group>
      ))}
    </group>
  )
}

function BookSpine({
  address,
  isSelected,
  shelf,
  book,
  onOpenBook,
}: {
  address: BookAddress
  isSelected: boolean
  shelf: number
  book: number
  onOpenBook: (address: BookAddress) => void
}) {
  const palette = ['#8f5224', '#536b42', '#72394b', '#b08a35', '#325a67']
  const height = 0.22 + ((book + shelf) % 3) * 0.036
  const color = isSelected ? '#efd15b' : palette[(book + shelf * 2) % palette.length]

  return (
    <mesh
      position={[-2.73 + book * 0.32, -0.01, 0.09]}
      onClick={(event) => {
        event.stopPropagation()
        onOpenBook(address)
      }}
    >
      <boxGeometry args={[0.24, height, 0.13]} />
      <meshStandardMaterial color={color} roughness={0.85} emissive={isSelected ? '#302000' : '#000000'} />
    </mesh>
  )
}

function Torch({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, -0.54, 0]}>
        <boxGeometry args={[0.08, 1.08, 0.08]} />
        <meshStandardMaterial color="#0b6f67" roughness={0.9} />
      </mesh>
      <mesh position={[0, -1.1, 0]}>
        <boxGeometry args={[0.5, 0.08, 0.22]} />
        <meshStandardMaterial color="#aaa99e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <coneGeometry args={[0.17, 0.46, 5]} />
        <meshStandardMaterial color="#1ed2c3" emissive="#168c87" emissiveIntensity={1.7} />
      </mesh>
    </group>
  )
}

function Stairs() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0.12]} position={[-2.9, 0.08, -3.7]}>
        <boxGeometry args={[1.6, 1.1, 0.16]} />
        <meshStandardMaterial color="#777b82" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, -0.12]} position={[2.9, 0.08, -3.7]}>
        <boxGeometry args={[1.6, 1.1, 0.16]} />
        <meshStandardMaterial color="#8e9299" roughness={1} />
      </mesh>
    </>
  )
}

function AddressPlaque({ floor, facing }: { floor: number; facing: number }) {
  const plaqueTexture = useMemo(() => makePlaqueTexture(floor, facing), [floor, facing])

  return (
    <mesh position={[0, 2.82, -7.95]}>
      <planeGeometry args={[1.45, 0.34]} />
      <meshBasicMaterial map={plaqueTexture} transparent />
    </mesh>
  )
}

function useArenaTextures() {
  return useMemo(
    () => ({
      wall: makePixelTexture(64, 64, (x, y) => {
        const row = Math.floor(y / 12)
        const offset = row % 2 === 0 ? 0 : 16
        const mortar = y % 12 < 2 || (x + offset) % 32 < 2
        if (mortar) return [34, 36, 44]
        const shade = ((x * 7 + y * 11) % 29) - 14
        return [96 + shade, 100 + shade, 112 + shade]
      }, [4, 3]),
      floor: makePixelTexture(64, 64, (x, y) => {
        const seam = x % 16 < 2 || y % 16 < 2
        const shade = ((x * 5 + y * 9) % 35) - 17
        return seam ? [28, 29, 34] : [58 + shade, 55 + shade, 50 + shade]
      }, [5, 6]),
      ceiling: makePixelTexture(64, 64, (x, y) => {
        const seam = x % 18 < 2 || y % 14 < 2
        const shade = ((x * 13 + y * 3) % 31) - 15
        return seam ? [42, 43, 49] : [112 + shade, 113 + shade, 118 + shade]
      }, [5, 4]),
    }),
    [],
  )
}

function makePixelTexture(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => [number, number, number],
  repeat: [number, number],
) {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = colorAt(x, y)
      const index = (y * width + x) * 4
      data[index] = r
      data[index + 1] = g
      data[index + 2] = b
      data[index + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(data, width, height)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(...repeat)
  texture.needsUpdate = true
  return texture
}

function makePlaqueTexture(floor: number, facing: number) {
  const width = 96
  const height = 24
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const border = x < 2 || y < 2 || x >= width - 2 || y >= height - 2
      const index = (y * width + x) * 4
      data[index] = border ? 205 : 32
      data[index + 1] = border ? 172 : 31
      data[index + 2] = border ? 88 : 35
      data[index + 3] = 255
    }
  }
  drawTinyBars(data, width, 8, 8, Math.abs(floor) % 8)
  drawTinyBars(data, width, 52, 8, facing + 1)
  const texture = new THREE.DataTexture(data, width, height)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.needsUpdate = true
  return texture
}

function drawTinyBars(data: Uint8Array, textureWidth: number, startX: number, startY: number, count: number) {
  for (let bar = 0; bar < count; bar += 1) {
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        const index = ((startY + y) * textureWidth + startX + bar * 5 + x) * 4
        data[index] = 238
        data[index + 1] = 210
        data[index + 2] = 121
        data[index + 3] = 255
      }
    }
  }
}

function useWebGLAvailable() {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    const canvas = document.createElement('canvas')
    const context =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')
    setAvailable(Boolean(context))
  }, [])

  return available
}
