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
  onLook: (deltaYaw: number) => void
  onTouchMoveChange: (movement: TouchMovement) => void
  onTouchStep: (movement: TouchMovement) => void
}

const roomSize = ROOM_HALF_SIZE * 2
const shelfWidth = 5.86
const bookSpacing = shelfWidth / BOOKS_PER_SHELF

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
  onLook,
  onTouchMoveChange,
  onTouchStep,
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
      const movement = movementFromPointer(event.currentTarget, event.clientX, event.clientY)
      onTouchMoveChange(movement)
      if (movement.forward !== 0 || movement.strafe !== 0) {
        onTouchStep(movement)
      }
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const deltaX = event.clientX - drag.lastX
    dragRef.current = { ...drag, lastX: event.clientX }
    onLook(deltaX * 0.004)

    if (drag.isTouch) {
      onTouchMoveChange(movementFromPointer(event.currentTarget, event.clientX, event.clientY))
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
      onTouchMoveChange({ forward: 0, strafe: 0 })
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

function movementFromPointer(element: HTMLDivElement, clientX: number, clientY: number): TouchMovement {
  const rect = element.getBoundingClientRect()
  const width = rect.width || window.innerWidth || 390
  const height = rect.height || window.innerHeight || 844
  const safeClientX = Number.isFinite(clientX) ? clientX : width / 2
  const safeClientY = Number.isFinite(clientY) ? clientY : 0
  const x = rect.width ? safeClientX - rect.left : safeClientX
  const y = rect.height ? safeClientY - rect.top : safeClientY
  const forward = y < height * 0.42 ? 1 : y > height * 0.68 ? -1 : 0
  const strafe = x < width * 0.24 ? -1 : x > width * 0.76 ? 1 : 0

  return { forward, strafe }
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
}: {
  playerPose: PlayerPose
  currentRoom: RoomPosition
  doors: DirectionIndex[]
  selectedBook: BookAddress
  movementCue: MovementCue
  onOpenBook: (address: BookAddress) => void
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
        <RoomWall key={`wall:${wall}`} wall={wall as DirectionIndex} hasDoor={doors.includes(wall as DirectionIndex)} texture={textures.wall} />
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
    camera.rotation.set(0, playerPose.yaw, 0)
  })

  return null
}

function RoomWall({ wall, hasDoor, texture }: { wall: DirectionIndex; hasDoor: boolean; texture: THREE.DataTexture }) {
  const transform = wallTransform(wall)

  return (
    <group position={transform.position} rotation={transform.rotation}>
      <mesh>
        <planeGeometry args={[roomSize, 3.08]} />
        <meshStandardMaterial map={texture} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      {hasDoor ? (
        <group position={[0, -0.52, 0.035]}>
          <mesh>
            <boxGeometry args={[1.02, 1.05, 0.08]} />
            <meshStandardMaterial color="#060507" roughness={1} />
          </mesh>
          <mesh position={[0, 0.58, 0.025]}>
            <boxGeometry args={[1.18, 0.12, 0.12]} />
            <meshStandardMaterial color="#806c55" roughness={0.9} />
          </mesh>
          <mesh position={[-0.59, 0.02, 0.025]}>
            <boxGeometry args={[0.1, 1.12, 0.12]} />
            <meshStandardMaterial color="#806c55" roughness={0.9} />
          </mesh>
          <mesh position={[0.59, 0.02, 0.025]}>
            <boxGeometry args={[0.1, 1.12, 0.12]} />
            <meshStandardMaterial color="#806c55" roughness={0.9} />
          </mesh>
        </group>
      ) : null}
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
}: {
  currentRoom: RoomPosition
  wall: DirectionIndex
  hasDoor: boolean
  selectedBook: BookAddress
  playerPose: PlayerPose
  onOpenBook: (address: BookAddress) => void
}) {
  const shelfWood = useMemo(() => new THREE.Color('#351d0f'), [])
  const transform = shelfTransform(wall)

  return (
    <group position={transform.position} rotation={transform.rotation}>
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[6.04, 1.86, 0.18]} />
        <meshStandardMaterial color={shelfWood} roughness={1} />
      </mesh>
      {hasDoor ? (
        <mesh position={[0, -0.43, 0.2]}>
          <boxGeometry args={[1.0, 0.96, 0.12]} />
          <meshStandardMaterial color="#060507" roughness={1} />
        </mesh>
      ) : null}
      {Array.from({ length: SHELVES_PER_WALL }, (_, shelf) => (
        <group key={shelf} position={[0, 0.7 - shelf * 0.34, 0.1]}>
          <mesh position={[0, -0.16, 0]}>
            <boxGeometry args={[6.06, 0.035, 0.24]} />
            <meshStandardMaterial color="#6d3a18" roughness={1} />
          </mesh>
          {Array.from({ length: BOOKS_PER_SHELF }, (_, book) => {
            const address = nearbyBookAddress(currentRoom.q, currentRoom.r, wall, shelf, book)
            const isSelected = addressLabel(address) === addressLabel(selectedBook)
            const isReachable = distanceToBook(playerPose, address) <= INTERACTION_RADIUS
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
    </group>
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
