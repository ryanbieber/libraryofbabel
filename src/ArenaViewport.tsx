import { Canvas, useFrame } from '@react-three/fiber'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { cardinalDirections, type DirectionIndex, type RoomPosition } from './lib/level'
import type { BookAddress } from './lib/library'
import {
  BOOKS_PER_SHELF,
  SHELVES_PER_WALL,
  addressLabel,
  nearbyBookAddress,
} from './lib/library'
import { cameraYawFromPlayerYaw } from './lib/camera'
import {
  INTERACTION_RADIUS,
  ROOM_HALF_SIZE,
  distanceToBook,
  yawToDirection,
  type PlayerPose,
} from './lib/roomGeometry'

type MovementCue = 'idle' | 'step' | 'turn-left' | 'turn-right'

type NearbyBook = {
  address: BookAddress
  distance: number
}

type TouchMovement = {
  forward: number
  strafe: number
}

type ArenaViewportProps = {
  floor: number
  playerPose: PlayerPose
  currentRoom: RoomPosition
  roomName: string
  doors: DirectionIndex[]
  selectedBook: BookAddress
  movementCue: MovementCue
  facingLabel: string
  nearbyBooks: NearbyBook[]
  onOpenBook: (address: BookAddress) => void
  onOpenDoor: (direction: DirectionIndex) => void
  onLook: (deltaYaw: number) => void
  onTouchForwardStart: () => void
  onTouchMoveChange: (movement: TouchMovement) => void
}

const roomSize = ROOM_HALF_SIZE * 2
const shelfWidth = 5.86
const bookSpacing = shelfWidth / BOOKS_PER_SHELF
const TOUCH_LOOK_SENSITIVITY = 0.0024
const MOUSE_LOOK_SENSITIVITY = 0.004

export function ArenaViewport({
  floor,
  playerPose,
  currentRoom,
  roomName,
  doors,
  selectedBook,
  movementCue,
  facingLabel,
  nearbyBooks,
  onOpenBook,
  onOpenDoor,
  onLook,
  onTouchForwardStart,
  onTouchMoveChange,
}: ArenaViewportProps) {
  const canUseWebGL = useWebGLAvailable()
  const dragRef = useRef<{ pointerId: number; lastX: number; isTouch: boolean } | null>(null)
  const facing = yawToDirection(playerPose.yaw)

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isPrimaryPointer(event) || isInteractiveTarget(event.target)) return

    const isTouch = event.pointerType !== 'mouse'
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, isTouch }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (isTouch) {
      onTouchMoveChange({ forward: 1, strafe: 0 })
      onTouchForwardStart()
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const deltaX = event.clientX - drag.lastX
    dragRef.current = { ...drag, lastX: event.clientX }
    onLook(deltaX * (drag.isTouch ? TOUCH_LOOK_SENSITIVITY : MOUSE_LOOK_SENSITIVITY))
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (drag?.pointerId === event.pointerId) {
      dragRef.current = null
      if (drag.isTouch) {
        onTouchMoveChange({ forward: 0, strafe: 0 })
      }
    }
  }

  return (
    <div
      className={`arena-viewport movement-${movementCue}`}
      data-testid="arena-viewport"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {canUseWebGL ? (
        <Canvas
          camera={{ fov: 58, position: [0, 1.52, 0], rotation: [0, 0, 0] }}
          dpr={1}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        >
          <ArenaScene
            playerPose={playerPose}
            currentRoom={currentRoom}
            doors={doors}
            selectedBook={selectedBook}
            movementCue={movementCue}
            onOpenBook={onOpenBook}
            onOpenDoor={onOpenDoor}
          />
        </Canvas>
      ) : (
        <div className="arena-canvas-unavailable" aria-hidden="true" />
      )}

      <div className="arena-crosshair" aria-hidden="true" />
      <div className="arena-plaque" aria-hidden="true">
        <strong>Floor {floor}</strong>
        <span>{facingLabel}</span>
      </div>
      <div className="room-label">
        <strong>{roomName}</strong>
        <span>{`room ${currentRoom.q},${currentRoom.r} / ${facingLabel} view`}</span>
      </div>
      <div className="door-strip" aria-label="Room doors">
        {cardinalDirections.map((direction, index) => {
          const doorIndex = index as DirectionIndex
          const isAvailable = doors.includes(doorIndex)
          const className = ['door-chip', isAvailable ? 'available' : 'sealed', index === facing ? 'facing' : ''].join(' ')

          return isAvailable ? (
            <button
              type="button"
              key={direction.label}
              className={className}
              aria-label={`Open ${direction.label} door`}
              onClick={() => onOpenDoor(doorIndex)}
            >
              {direction.shortLabel}
            </button>
          ) : (
            <span key={direction.label} className={className} aria-label={`${direction.label} door sealed`}>
              {direction.shortLabel}
            </span>
          )
        })}
      </div>
      {nearbyBooks.length > 0 ? (
        <div className="nearby-book-list" aria-label="Nearby shelf volumes">
          {nearbyBooks.map(({ address }) => (
            <button
              type="button"
              key={addressLabel(address)}
              aria-label={`Open ${addressLabel(address)}`}
              onClick={() => onOpenBook(address)}
            >
              <span>{cardinalDirections[address.wall].shortLabel}</span>
              <strong>{address.shelf + 1}-{address.book + 1}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, input, textarea, select, a'))
}

function isPrimaryPointer(event: ReactPointerEvent<HTMLDivElement>): boolean {
  const pointerType = event.pointerType as string | undefined
  return event.button === 0 || pointerType !== 'mouse'
}

function ArenaScene({
  playerPose,
  currentRoom,
  doors,
  selectedBook,
  movementCue,
  onOpenBook,
  onOpenDoor,
}: {
  playerPose: PlayerPose
  currentRoom: RoomPosition
  doors: DirectionIndex[]
  selectedBook: BookAddress
  movementCue: MovementCue
  onOpenBook: (address: BookAddress) => void
  onOpenDoor: (direction: DirectionIndex) => void
}) {
  const textures = useArenaTextures()

  return (
    <>
      <PlayerCamera playerPose={playerPose} movementCue={movementCue} />
      <color attach="background" args={['#09090b']} />
      <fog attach="fog" args={['#09090b', 3.6, 10.8]} />
      <ambientLight intensity={0.54} />
      <pointLight color="#d5c3a3" intensity={11} position={[0, 2.45, 0]} distance={8} />
      <pointLight color="#1ed2c3" intensity={4.5} position={[-2.9, 1.9, -2.9]} distance={4.5} />
      <pointLight color="#1ed2c3" intensity={4.5} position={[2.9, 1.9, 2.9]} distance={4.5} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[roomSize, roomSize]} />
        <meshStandardMaterial map={textures.floor} roughness={1} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 3.08, 0]}>
        <planeGeometry args={[roomSize, roomSize]} />
        <meshStandardMaterial map={textures.ceiling} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {cardinalDirections.map((_, wall) => (
        <RoomWall
          key={`wall:${wall}`}
          wall={wall as DirectionIndex}
          hasDoor={doors.includes(wall as DirectionIndex)}
          texture={textures.wall}
          onOpenDoor={onOpenDoor}
        />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <planeGeometry args={[1.8, 2.8]} />
        <meshStandardMaterial color="#8e0e12" roughness={0.95} />
      </mesh>

      <ReadingTable />
      <Torch position={[-2.95, 1.26, -2.95]} />
      <Torch position={[2.95, 1.26, 2.95]} />
      {cardinalDirections.map((_, wall) => (
        <ShelfWall
          key={`shelf:${wall}`}
          currentRoom={currentRoom}
          wall={wall as DirectionIndex}
          hasDoor={doors.includes(wall as DirectionIndex)}
          selectedBook={selectedBook}
          playerPose={playerPose}
          onOpenBook={onOpenBook}
          onOpenDoor={onOpenDoor}
        />
      ))}
      <Stairs />
    </>
  )
}

function PlayerCamera({ playerPose, movementCue }: { playerPose: PlayerPose; movementCue: MovementCue }) {
  useFrame(({ camera, clock }) => {
    const idleBob = Math.sin(clock.elapsedTime * 2.4) * 0.007
    const stepBob = movementCue === 'step' ? Math.sin(clock.elapsedTime * 20) * 0.018 : 0
    camera.position.set(playerPose.x, 1.52 + idleBob + stepBob, playerPose.z)
    camera.rotation.set(0, cameraYawFromPlayerYaw(playerPose.yaw), 0)
  })

  return null
}

function RoomWall({
  wall,
  hasDoor,
  texture,
  onOpenDoor,
}: {
  wall: DirectionIndex
  hasDoor: boolean
  texture: THREE.DataTexture
  onOpenDoor: (direction: DirectionIndex) => void
}) {
  const transform = wallTransform(wall)

  return (
    <group position={transform.position} rotation={transform.rotation}>
      <mesh>
        <planeGeometry args={[roomSize, 3.08]} />
        <meshStandardMaterial map={texture} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      {hasDoor ? <Doorway onOpen={() => onOpenDoor(wall)} /> : null}
    </group>
  )
}

function Doorway({ compact = false, onOpen }: { compact?: boolean; onOpen: () => void }) {
  const width = compact ? 1.04 : 1.2
  const height = compact ? 0.98 : 1.12
  const y = compact ? -0.43 : -0.52
  const z = compact ? 0.23 : 0.06

  return (
    <group
      position={[0, y, z]}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
    >
      <mesh position={[0, 0.02, 0.16]}>
        <boxGeometry args={[width * 0.86, height * 0.82, 0.06]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[width, height, 0.1]} />
        <meshStandardMaterial color="#080708" roughness={1} />
      </mesh>
      <mesh position={[0, 0.08, -0.01]}>
        <boxGeometry args={[width * 0.68, height * 0.62, 0.06]} />
        <meshStandardMaterial color="#11181c" roughness={1} emissive="#071013" emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, height / 2 + 0.04, 0.06]}>
        <boxGeometry args={[width + 0.22, 0.16, 0.2]} />
        <meshStandardMaterial color="#826b50" roughness={0.92} />
      </mesh>
      <mesh position={[-width / 2 - 0.07, 0, 0.06]}>
        <boxGeometry args={[0.14, height + 0.18, 0.2]} />
        <meshStandardMaterial color="#806044" roughness={0.95} />
      </mesh>
      <mesh position={[width / 2 + 0.07, 0, 0.06]}>
        <boxGeometry args={[0.14, height + 0.18, 0.2]} />
        <meshStandardMaterial color="#806044" roughness={0.95} />
      </mesh>
      <mesh position={[0, -height / 2 + 0.07, 0.08]}>
        <boxGeometry args={[width * 0.94, 0.12, 0.26]} />
        <meshStandardMaterial color="#8a8470" roughness={0.98} />
      </mesh>
      <mesh position={[width * 0.33, -0.02, 0.1]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#cfa94c" metalness={0.25} roughness={0.48} />
      </mesh>
    </group>
  )
}

function ReadingTable() {
  return (
    <group position={[0, 0.54, 0]}>
      <mesh position={[0, 0.24, 0]}>
        <boxGeometry args={[1.4, 0.18, 0.74]} />
        <meshStandardMaterial color="#4a2814" roughness={0.9} />
      </mesh>
      {[-0.54, 0.54].map((x) =>
        [-0.24, 0.24].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, -0.22, z]}>
            <boxGeometry args={[0.13, 0.72, 0.13]} />
            <meshStandardMaterial color="#2a150a" roughness={1} />
          </mesh>
        )),
      )}
      <mesh rotation={[-0.18, 0.08, 0]} position={[-0.25, 0.38, 0]}>
        <boxGeometry args={[0.36, 0.04, 0.3]} />
        <meshStandardMaterial color="#d8bd7d" roughness={0.85} />
      </mesh>
      <mesh rotation={[-0.18, -0.08, 0]} position={[0.12, 0.385, 0]}>
        <boxGeometry args={[0.36, 0.04, 0.3]} />
        <meshStandardMaterial color="#ceb170" roughness={0.85} />
      </mesh>
    </group>
  )
}

function ShelfWall({
  currentRoom,
  wall,
  hasDoor,
  selectedBook,
  playerPose,
  onOpenBook,
  onOpenDoor,
}: {
  currentRoom: RoomPosition
  wall: DirectionIndex
  hasDoor: boolean
  selectedBook: BookAddress
  playerPose: PlayerPose
  onOpenBook: (address: BookAddress) => void
  onOpenDoor: (direction: DirectionIndex) => void
}) {
  const shelfWood = useMemo(() => new THREE.Color('#351d0f'), [])
  const transform = shelfTransform(wall)

  return (
    <group position={transform.position} rotation={transform.rotation}>
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[6.04, 1.86, 0.18]} />
        <meshStandardMaterial color={shelfWood} roughness={1} />
      </mesh>
      {Array.from({ length: SHELVES_PER_WALL }, (_, shelf) => (
        <group key={shelf} position={[0, 0.7 - shelf * 0.34, 0.1]}>
          <ShelfBoard hasDoorGap={hasDoor && shelf >= 2} />
          {Array.from({ length: BOOKS_PER_SHELF }, (_, book) => {
            const address = nearbyBookAddress(currentRoom.q, currentRoom.r, wall, shelf, book)
            const isSelected = addressLabel(address) === addressLabel(selectedBook)
            const isReachable = distanceToBook(playerPose, address) <= INTERACTION_RADIUS
            const x = bookXPosition(book)
            if (hasDoor && shelf >= 2 && Math.abs(x) < 0.72) return null

            return (
              <BookSpine
                key={`${shelf}:${book}`}
                address={address}
                isSelected={isSelected}
                isReachable={isReachable}
                shelf={shelf}
                book={book}
                onOpenBook={onOpenBook}
              />
            )
          })}
        </group>
      ))}
      {hasDoor ? <Doorway compact onOpen={() => onOpenDoor(wall)} /> : null}
    </group>
  )
}

function ShelfBoard({ hasDoorGap }: { hasDoorGap: boolean }) {
  if (!hasDoorGap) {
    return (
      <mesh position={[0, -0.16, 0]}>
        <boxGeometry args={[6.06, 0.035, 0.24]} />
        <meshStandardMaterial color="#6d3a18" roughness={1} />
      </mesh>
    )
  }

  return (
    <>
      <mesh position={[-1.92, -0.16, 0]}>
        <boxGeometry args={[2.22, 0.035, 0.24]} />
        <meshStandardMaterial color="#6d3a18" roughness={1} />
      </mesh>
      <mesh position={[1.92, -0.16, 0]}>
        <boxGeometry args={[2.22, 0.035, 0.24]} />
        <meshStandardMaterial color="#6d3a18" roughness={1} />
      </mesh>
    </>
  )
}

function BookSpine({
  address,
  isSelected,
  isReachable,
  shelf,
  book,
  onOpenBook,
}: {
  address: BookAddress
  isSelected: boolean
  isReachable: boolean
  shelf: number
  book: number
  onOpenBook: (address: BookAddress) => void
}) {
  const palette = ['#8f5224', '#536b42', '#72394b', '#b08a35', '#325a67', '#6c5434']
  const height = 0.2 + ((book + shelf) % 3) * 0.034
  const color = isSelected ? '#efd15b' : palette[(book + shelf * 2) % palette.length]

  return (
    <mesh
      position={[-shelfWidth / 2 + bookSpacing * (book + 0.5), -0.01, 0.09]}
      onClick={(event) => {
        event.stopPropagation()
        onOpenBook(address)
      }}
    >
      <boxGeometry args={[bookSpacing * 0.72, height, 0.13]} />
      <meshStandardMaterial
        color={color}
        roughness={0.85}
        emissive={isSelected || isReachable ? '#302000' : '#000000'}
        emissiveIntensity={isReachable ? 0.65 : 0.35}
      />
    </mesh>
  )
}

function bookXPosition(book: number): number {
  return -shelfWidth / 2 + bookSpacing * (book + 0.5)
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
      <mesh rotation={[-Math.PI / 2, 0, 0.12]} position={[-2.45, 0.08, 1.55]}>
        <boxGeometry args={[1.35, 0.86, 0.16]} />
        <meshStandardMaterial color="#777b82" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, -0.12]} position={[2.45, 0.08, -1.55]}>
        <boxGeometry args={[1.35, 0.86, 0.16]} />
        <meshStandardMaterial color="#8e9299" roughness={1} />
      </mesh>
    </>
  )
}

function wallTransform(wall: DirectionIndex): {
  position: [number, number, number]
  rotation: [number, number, number]
} {
  switch (wall) {
    case 0:
      return { position: [0, 1.54, -ROOM_HALF_SIZE], rotation: [0, 0, 0] }
    case 1:
      return { position: [ROOM_HALF_SIZE, 1.54, 0], rotation: [0, -Math.PI / 2, 0] }
    case 2:
      return { position: [0, 1.54, ROOM_HALF_SIZE], rotation: [0, Math.PI, 0] }
    case 3:
      return { position: [-ROOM_HALF_SIZE, 1.54, 0], rotation: [0, Math.PI / 2, 0] }
  }
}

function shelfTransform(wall: DirectionIndex): {
  position: [number, number, number]
  rotation: [number, number, number]
} {
  const inset = 0.12
  switch (wall) {
    case 0:
      return { position: [0, 1.42, -ROOM_HALF_SIZE + inset], rotation: [0, 0, 0] }
    case 1:
      return { position: [ROOM_HALF_SIZE - inset, 1.42, 0], rotation: [0, -Math.PI / 2, 0] }
    case 2:
      return { position: [0, 1.42, ROOM_HALF_SIZE - inset], rotation: [0, Math.PI, 0] }
    case 3:
      return { position: [-ROOM_HALF_SIZE + inset, 1.42, 0], rotation: [0, Math.PI / 2, 0] }
  }
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
      }, [5, 5]),
      ceiling: makePixelTexture(64, 64, (x, y) => {
        const seam = x % 18 < 2 || y % 14 < 2
        const shade = ((x * 13 + y * 3) % 31) - 15
        return seam ? [42, 43, 49] : [112 + shade, 113 + shade, 118 + shade]
      }, [4, 4]),
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
