import { Canvas, useFrame } from '@react-three/fiber'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { cardinalDirections, type DirectionIndex, type RoomKind, type RoomPosition } from './lib/level'
import type { BookAddress } from './lib/library'
import {
  BOOKS_PER_SHELF,
  SHELVES_PER_WALL,
  addressLabel,
  nearbyBookAddress,
} from './lib/library'
import { cameraYawFromPlayerYaw } from './lib/camera'
import type { LibraryNpc } from './lib/npcs'
import {
  BOOK_INTERACTION_RADIUS,
  ROOM_HALF_SIZE,
  SHELF_WIDTH,
  distanceToBook,
  yawToDirection,
  type PlayerPose,
} from './lib/roomGeometry'
import {
  COMPACT_DOORWAY_HEIGHT,
  PLAYER_EYE_HEIGHT,
  ROOM_HEIGHT,
  SEATED_MONK_BASE_Y,
  SEATED_MONK_SCALE,
  STANDARD_DOORWAY_HEIGHT,
  doorwayLocalY,
} from './lib/sceneScale'
import { roomVisualProfile, type RoomVisualProfile } from './lib/roomVisuals'

type MovementCue = 'idle' | 'step' | 'turn-left' | 'turn-right'

type HoldMovement = {
  forward: number
  strafe: number
  turnSlowdown: number
}

export type QuestMarkerState = 'available' | 'active' | null

type ArenaViewportProps = {
  playerPose: PlayerPose
  currentRoom: RoomPosition
  roomName: string
  roomKind: RoomKind
  doors: DirectionIndex[]
  selectedBook: BookAddress
  movementCue: MovementCue
  facingLabel: string
  npc: LibraryNpc | null
  questMarker: QuestMarkerState
  canTalkToNpc: boolean
  onOpenBook: (address: BookAddress) => void
  onOpenDoor: (direction: DirectionIndex) => void
  onTalkToNpc: () => void
  onLook: (deltaYaw: number) => void
  onHoldForwardStart: () => void
  onHoldMoveChange: (movement: HoldMovement) => void
}

const roomSize = ROOM_HALF_SIZE * 2
const shelfWidth = SHELF_WIDTH
const bookSpacing = shelfWidth / BOOKS_PER_SHELF
const shelfBackWidth = shelfWidth + 0.18
const shelfBoardWidth = shelfWidth + 0.2
const doorwayGapWidth = 1.44
const TOUCH_LOOK_SENSITIVITY = 0.0042
const MOUSE_LOOK_SENSITIVITY = 0.0062
const DRAG_TURN_DEADZONE_PX = 0.6
const DRAG_TURN_RECOVERY_MS = 180
const DRAG_TURN_SLOWDOWN_MAX_DELTA = 52

export function ArenaViewport({
  playerPose,
  currentRoom,
  roomName,
  roomKind,
  doors,
  selectedBook,
  movementCue,
  facingLabel,
  npc,
  questMarker,
  canTalkToNpc,
  onOpenBook,
  onOpenDoor,
  onTalkToNpc,
  onLook,
  onHoldForwardStart,
  onHoldMoveChange,
}: ArenaViewportProps) {
  const canUseWebGL = useWebGLAvailable()
  const dragRef = useRef<{ pointerId: number; lastX: number; isTouch: boolean } | null>(null)
  const turnRecoveryTimeoutRef = useRef<number | null>(null)
  const facing = yawToDirection(playerPose.yaw)

  useEffect(
    () => () => {
      if (turnRecoveryTimeoutRef.current !== null) {
        window.clearTimeout(turnRecoveryTimeoutRef.current)
      }
    },
    [],
  )

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isPrimaryPointer(event) || isInteractiveTarget(event.target)) return

    const isTouch = event.pointerType !== 'mouse'
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, isTouch }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    onHoldMoveChange({ forward: 1, strafe: 0, turnSlowdown: 0 })
    onHoldForwardStart()
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const deltaX = event.clientX - drag.lastX
    dragRef.current = { ...drag, lastX: event.clientX }
    onLook(deltaX * (drag.isTouch ? TOUCH_LOOK_SENSITIVITY : MOUSE_LOOK_SENSITIVITY))
    if (Math.abs(deltaX) > DRAG_TURN_DEADZONE_PX) {
      if (turnRecoveryTimeoutRef.current !== null) {
        window.clearTimeout(turnRecoveryTimeoutRef.current)
      }
      const turnSlowdown = Math.min(1, Math.abs(deltaX) / DRAG_TURN_SLOWDOWN_MAX_DELTA)
      onHoldMoveChange({ forward: 1, strafe: 0, turnSlowdown })
      turnRecoveryTimeoutRef.current = window.setTimeout(() => {
        if (dragRef.current?.pointerId === event.pointerId) {
          onHoldMoveChange({ forward: 1, strafe: 0, turnSlowdown: 0 })
        }
      }, DRAG_TURN_RECOVERY_MS)
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (drag?.pointerId === event.pointerId) {
      dragRef.current = null
      if (turnRecoveryTimeoutRef.current !== null) {
        window.clearTimeout(turnRecoveryTimeoutRef.current)
        turnRecoveryTimeoutRef.current = null
      }
      onHoldMoveChange({ forward: 0, strafe: 0, turnSlowdown: 0 })
    }
  }

  return (
    <div
      className={`arena-viewport movement-${movementCue}`}
      data-testid="arena-viewport"
      data-room-kind={roomKind}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {canUseWebGL ? (
        <Canvas
          camera={{ fov: 58, position: [0, PLAYER_EYE_HEIGHT, 0], rotation: [0, 0, 0] }}
          dpr={1}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        >
          <ArenaScene
            playerPose={playerPose}
            currentRoom={currentRoom}
            roomKind={roomKind}
            doors={doors}
            selectedBook={selectedBook}
            movementCue={movementCue}
            npc={npc}
            questMarker={questMarker}
            onOpenBook={onOpenBook}
            onOpenDoor={onOpenDoor}
            onTalkToNpc={onTalkToNpc}
          />
        </Canvas>
      ) : (
        <div className="arena-canvas-unavailable" aria-hidden="true" />
      )}

      <div className="arena-crosshair" aria-hidden="true" />
      <div className="arena-plaque" aria-hidden="true">
        <strong>{facingLabel}</strong>
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
      {npc && canTalkToNpc ? (
        <button type="button" className="npc-talk-button" aria-label={`Talk to ${npc.name}`} onClick={onTalkToNpc}>
          Talk
        </button>
      ) : null}
      {npc && questMarker ? (
        <div className={`npc-quest-marker ${questMarker}`} aria-hidden="true">
          {questMarker === 'available' ? '!' : '?'}
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
  roomKind,
  doors,
  selectedBook,
  movementCue,
  npc,
  questMarker,
  onOpenBook,
  onOpenDoor,
  onTalkToNpc,
}: {
  playerPose: PlayerPose
  currentRoom: RoomPosition
  roomKind: RoomKind
  doors: DirectionIndex[]
  selectedBook: BookAddress
  movementCue: MovementCue
  npc: LibraryNpc | null
  questMarker: QuestMarkerState
  onOpenBook: (address: BookAddress) => void
  onOpenDoor: (direction: DirectionIndex) => void
  onTalkToNpc: () => void
}) {
  const profile = roomVisualProfile(roomKind)
  const textures = useArenaTextures(roomKind)

  return (
    <>
      <PlayerCamera playerPose={playerPose} movementCue={movementCue} />
      <color attach="background" args={[profile.lighting.background]} />
      <fog attach="fog" args={[profile.lighting.fog, profile.lighting.fogNear, profile.lighting.fogFar]} />
      <ambientLight intensity={profile.lighting.ambientIntensity} />
      <pointLight color={profile.lighting.mainColor} intensity={profile.lighting.mainIntensity} position={[0, 2.45, 0]} distance={8} />
      <pointLight color={profile.lighting.accentColor} intensity={profile.lighting.accentIntensity} position={[-2.9, 1.9, -2.9]} distance={4.5} />
      <pointLight color={profile.lighting.accentColor} intensity={profile.lighting.accentIntensity} position={[2.9, 1.9, 2.9]} distance={4.5} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[roomSize, roomSize]} />
        <meshStandardMaterial map={textures.floor} roughness={1} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM_HEIGHT, 0]}>
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
      <mesh rotation={[-Math.PI / 2, 0, profile.rug.rotation]} position={[0, 0.012, 0]}>
        <planeGeometry args={[profile.rug.width, profile.rug.depth]} />
        <meshStandardMaterial color={profile.rug.color} roughness={0.95} />
      </mesh>

      <ReadingTable profile={profile} />
      {npc ? <SeatedMonk npc={npc} questMarker={questMarker} onTalk={onTalkToNpc} /> : null}
      <RoomPlaques profile={profile} />
      <Torch position={[-2.95, 1.26, -2.95]} profile={profile} />
      <Torch position={[2.95, 1.26, 2.95]} profile={profile} />
      {cardinalDirections.map((_, wall) => (
        <ShelfWall
          key={`shelf:${wall}`}
          currentRoom={currentRoom}
          wall={wall as DirectionIndex}
          hasDoor={doors.includes(wall as DirectionIndex)}
          profile={profile}
          selectedBook={selectedBook}
          playerPose={playerPose}
          onOpenBook={onOpenBook}
          onOpenDoor={onOpenDoor}
        />
      ))}
      <DustMotes profile={profile} />
      <Stairs />
    </>
  )
}

function SeatedMonk({ npc, questMarker, onTalk }: { npc: LibraryNpc; questMarker: QuestMarkerState; onTalk: () => void }) {
  const animatedGroupRef = useRef<THREE.Group>(null)
  const hoodRef = useRef<THREE.Mesh>(null)
  const bookGlow = npc.quest === 'crimson-book' ? '#7b1116' : '#302000'

  useFrame(({ clock }) => {
    const breath = Math.sin(clock.elapsedTime * 1.8) * 0.018
    if (animatedGroupRef.current) {
      animatedGroupRef.current.position.y = breath
    }
    if (hoodRef.current) {
      hoodRef.current.rotation.x = -0.26 + Math.sin(clock.elapsedTime * 1.2) * 0.035
    }
  })

  return (
    <group
      position={[npc.position.x, SEATED_MONK_BASE_Y, npc.position.z - 0.35]}
      rotation={[0, Math.PI * 0.88, 0]}
      scale={SEATED_MONK_SCALE}
      onClick={(event) => {
        event.stopPropagation()
        onTalk()
      }}
    >
      <group ref={animatedGroupRef}>
        <mesh position={[0, 0.33, -0.03]}>
          <boxGeometry args={[0.6, 0.66, 0.36]} />
          <meshStandardMaterial color="#251820" roughness={0.98} />
        </mesh>
        <mesh position={[0, 0.06, -0.02]} rotation={[0.08, 0, 0]}>
          <coneGeometry args={[0.42, 0.82, 6]} />
          <meshStandardMaterial color="#1d141a" roughness={1} />
        </mesh>
        <mesh ref={hoodRef} position={[0, 0.78, -0.1]} rotation={[-0.26, 0, 0]}>
          <coneGeometry args={[0.28, 0.42, 7]} />
          <meshStandardMaterial color="#0b090c" roughness={1} />
        </mesh>
        <mesh position={[0, 0.67, -0.02]} rotation={[-0.18, 0, 0]}>
          <sphereGeometry args={[0.16, 10, 8]} />
          <meshStandardMaterial color="#806446" roughness={0.92} />
        </mesh>
        <mesh position={[-0.23, 0.43, 0.18]} rotation={[0.9, 0.32, 0.16]}>
          <capsuleGeometry args={[0.045, 0.32, 4, 6]} />
          <meshStandardMaterial color="#6f543b" roughness={0.9} />
        </mesh>
        <mesh position={[0.23, 0.43, 0.18]} rotation={[0.9, -0.32, -0.16]}>
          <capsuleGeometry args={[0.045, 0.32, 4, 6]} />
          <meshStandardMaterial color="#6f543b" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.315, 0.34]} rotation={[-0.18, 0, 0]}>
          <boxGeometry args={[0.52, 0.026, 0.3]} />
          <meshStandardMaterial color="#d8bd7d" roughness={0.86} emissive={bookGlow} emissiveIntensity={0.22} />
        </mesh>
        <mesh position={[0, 0.58, 0]}>
          <boxGeometry args={[0.76, 1.1, 0.62]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {questMarker ? <QuestMarkerBillboard state={questMarker} /> : null}
      </group>
    </group>
  )
}

function QuestMarkerBillboard({ state }: { state: Exclude<QuestMarkerState, null> }) {
  const texture = useMemo(() => createQuestMarkerTexture(state), [state])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <sprite position={[0, 1.42, -0.02]} scale={[0.42, 0.42, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  )
}

function createQuestMarkerTexture(state: Exclude<QuestMarkerState, null>): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    const isAvailable = state === 'available'
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = isAvailable ? '#f1c84b' : '#d8dce4'
    context.strokeStyle = isAvailable ? '#5c3d00' : '#3f4652'
    context.lineWidth = 10
    context.shadowColor = isAvailable ? 'rgba(255, 224, 112, 0.82)' : 'rgba(230, 236, 248, 0.72)'
    context.shadowBlur = 18
    context.font = '900 104px Georgia, serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const glyph = isAvailable ? '!' : '?'
    context.strokeText(glyph, 64, 62)
    context.fillText(glyph, 64, 62)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function PlayerCamera({ playerPose, movementCue }: { playerPose: PlayerPose; movementCue: MovementCue }) {
  useFrame(({ camera, clock }) => {
    const idleBob = Math.sin(clock.elapsedTime * 2.4) * 0.007
    const stepBob = movementCue === 'step' ? Math.sin(clock.elapsedTime * 20) * 0.018 : 0
    camera.position.set(playerPose.x, PLAYER_EYE_HEIGHT + idleBob + stepBob, playerPose.z)
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
        <planeGeometry args={[roomSize, ROOM_HEIGHT]} />
        <meshStandardMaterial map={texture} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      {hasDoor ? <Doorway parentCenterY={transform.position[1]} onOpen={() => onOpenDoor(wall)} /> : null}
    </group>
  )
}

function Doorway({
  compact = false,
  parentCenterY,
  onOpen,
}: {
  compact?: boolean
  parentCenterY: number
  onOpen: () => void
}) {
  const width = compact ? 1.04 : 1.2
  const height = compact ? COMPACT_DOORWAY_HEIGHT : STANDARD_DOORWAY_HEIGHT
  const y = doorwayLocalY(height, parentCenterY)
  const z = compact ? 0.23 : 0.06
  const frameOverhang = compact ? 0.18 : 0.2
  const jambWidth = compact ? 0.13 : 0.14
  const handleY = compact ? 1.02 : 1.05
  const bottomY = -height / 2
  const slabDepth = compact ? 0.08 : 0.1
  const slabColor = compact ? '#4b2c18' : '#53311d'
  const panelColor = compact ? '#3d2414' : '#462815'

  return (
    <group
      position={[0, y, z]}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
    >
      <mesh position={[0, 0.02, 0.16]}>
        <boxGeometry args={[width * 0.86, height * 0.92, 0.06]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[width * 0.94, height * 0.98, slabDepth]} />
        <meshStandardMaterial color={slabColor} roughness={0.96} />
      </mesh>
      <mesh position={[0, bottomY + height * 0.72, 0]}>
        <boxGeometry args={[width * 0.66, height * 0.34, 0.03]} />
        <meshStandardMaterial color={panelColor} roughness={1} />
      </mesh>
      <mesh position={[0, bottomY + height * 0.3, 0]}>
        <boxGeometry args={[width * 0.66, height * 0.28, 0.03]} />
        <meshStandardMaterial color={panelColor} roughness={1} />
      </mesh>
      <mesh position={[0, height / 2 + frameOverhang / 2, 0.06]}>
        <boxGeometry args={[width + 0.22, frameOverhang, 0.2]} />
        <meshStandardMaterial color="#826b50" roughness={0.92} />
      </mesh>
      <mesh position={[-width / 2 - jambWidth / 2, frameOverhang / 2, 0.06]}>
        <boxGeometry args={[jambWidth, height + frameOverhang, 0.2]} />
        <meshStandardMaterial color="#806044" roughness={0.95} />
      </mesh>
      <mesh position={[width / 2 + jambWidth / 2, frameOverhang / 2, 0.06]}>
        <boxGeometry args={[jambWidth, height + frameOverhang, 0.2]} />
        <meshStandardMaterial color="#806044" roughness={0.95} />
      </mesh>
      <mesh position={[0, bottomY + 0.03, 0.08]}>
        <boxGeometry args={[width * 0.94, 0.06, 0.26]} />
        <meshStandardMaterial color="#8a8470" roughness={0.98} />
      </mesh>
      <mesh position={[width * 0.33, handleY - height / 2, 0.1]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#cfa94c" metalness={0.25} roughness={0.48} />
      </mesh>
    </group>
  )
}

function ReadingTable({ profile }: { profile: RoomVisualProfile }) {
  return (
    <group
      position={profile.table.position}
      rotation={[0, profile.table.rotationY, 0]}
      scale={profile.table.scale}
    >
      <mesh position={[0, 0.24, 0]}>
        <boxGeometry args={[1.4, 0.18, 0.74]} />
        <meshStandardMaterial color={profile.table.topColor} roughness={0.9} />
      </mesh>
      {[-0.54, 0.54].map((x) =>
        [-0.24, 0.24].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, -0.22, z]}>
            <boxGeometry args={[0.13, 0.72, 0.13]} />
            <meshStandardMaterial color={profile.table.legColor} roughness={1} />
          </mesh>
        )),
      )}
      <TableAccessory profile={profile} />
    </group>
  )
}

function TableAccessory({ profile }: { profile: RoomVisualProfile }) {
  switch (profile.table.accessory) {
    case 'archive-ledgers':
      return (
        <>
          <mesh rotation={[-0.08, 0.16, 0]} position={[-0.28, 0.37, -0.02]}>
            <boxGeometry args={[0.48, 0.08, 0.34]} />
            <meshStandardMaterial color="#8f6d3c" roughness={0.9} />
          </mesh>
          <mesh rotation={[-0.05, -0.12, 0]} position={[0.18, 0.43, 0.08]}>
            <boxGeometry args={[0.42, 0.12, 0.3]} />
            <meshStandardMaterial color="#5b3421" roughness={0.92} />
          </mesh>
          <mesh position={[0.47, 0.38, -0.14]}>
            <boxGeometry args={[0.24, 0.14, 0.24]} />
            <meshStandardMaterial color="#6e5129" roughness={1} />
          </mesh>
        </>
      )
    case 'display-case':
      return (
        <>
          <mesh rotation={[-0.16, 0, 0]} position={[0, 0.37, 0]}>
            <boxGeometry args={[0.5, 0.035, 0.36]} />
            <meshStandardMaterial color="#d9c37c" roughness={0.8} emissive="#302000" emissiveIntensity={0.12} />
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.66, 0.22, 0.46]} />
            <meshStandardMaterial color="#bfe8ee" transparent opacity={0.24} roughness={0.18} />
          </mesh>
        </>
      )
    case 'open-books':
      return (
        <>
          <mesh rotation={[-0.18, 0.08, 0]} position={[-0.25, 0.38, 0]}>
            <boxGeometry args={[0.36, 0.04, 0.3]} />
            <meshStandardMaterial color="#d8bd7d" roughness={0.85} />
          </mesh>
          <mesh rotation={[-0.18, -0.08, 0]} position={[0.12, 0.385, 0]}>
            <boxGeometry args={[0.36, 0.04, 0.3]} />
            <meshStandardMaterial color="#ceb170" roughness={0.85} />
          </mesh>
        </>
      )
  }
}

function ShelfWall({
  currentRoom,
  wall,
  hasDoor,
  profile,
  selectedBook,
  playerPose,
  onOpenBook,
  onOpenDoor,
}: {
  currentRoom: RoomPosition
  wall: DirectionIndex
  hasDoor: boolean
  profile: RoomVisualProfile
  selectedBook: BookAddress
  playerPose: PlayerPose
  onOpenBook: (address: BookAddress) => void
  onOpenDoor: (direction: DirectionIndex) => void
}) {
  const shelfWood = useMemo(() => new THREE.Color(profile.shelf.woodColor), [profile.shelf.woodColor])
  const transform = shelfTransform(wall)

  return (
    <group position={transform.position} rotation={transform.rotation}>
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[shelfBackWidth, profile.shelf.backHeight, 0.18]} />
        <meshStandardMaterial color={shelfWood} roughness={1} />
      </mesh>
      {Array.from({ length: SHELVES_PER_WALL }, (_, shelf) => (
        <group key={shelf} position={[0, profile.shelf.verticalStart - shelf * profile.shelf.verticalStep, 0.1]}>
          <ShelfBoard hasDoorGap={hasDoor} profile={profile} />
          {Array.from({ length: BOOKS_PER_SHELF }, (_, book) => {
            const address = nearbyBookAddress(currentRoom.q, currentRoom.r, wall, shelf, book)
            const isSelected = addressLabel(address) === addressLabel(selectedBook)
            const isReachable = distanceToBook(playerPose, address) <= BOOK_INTERACTION_RADIUS
            const x = bookXPosition(book)
            if (hasDoor && Math.abs(x) < 0.72) return null

            return (
              <BookSpine
                key={`${shelf}:${book}`}
                address={address}
                isSelected={isSelected}
                isReachable={isReachable}
                shelf={shelf}
                book={book}
                profile={profile}
                onOpenBook={onOpenBook}
              />
            )
          })}
        </group>
      ))}
      {hasDoor ? <Doorway compact parentCenterY={transform.position[1]} onOpen={() => onOpenDoor(wall)} /> : null}
    </group>
  )
}

function ShelfBoard({ hasDoorGap, profile }: { hasDoorGap: boolean; profile: RoomVisualProfile }) {
  if (!hasDoorGap) {
    return (
      <mesh position={[0, -0.16, 0]}>
        <boxGeometry args={[shelfBoardWidth, 0.035, 0.24]} />
        <meshStandardMaterial color={profile.shelf.boardColor} roughness={1} />
      </mesh>
    )
  }

  const sideBoardWidth = (shelfBoardWidth - doorwayGapWidth) / 2
  const sideBoardOffset = doorwayGapWidth / 2 + sideBoardWidth / 2

  return (
    <>
      <mesh position={[-sideBoardOffset, -0.16, 0]}>
        <boxGeometry args={[sideBoardWidth, 0.035, 0.24]} />
        <meshStandardMaterial color={profile.shelf.boardColor} roughness={1} />
      </mesh>
      <mesh position={[sideBoardOffset, -0.16, 0]}>
        <boxGeometry args={[sideBoardWidth, 0.035, 0.24]} />
        <meshStandardMaterial color={profile.shelf.boardColor} roughness={1} />
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
  profile,
  onOpenBook,
}: {
  address: BookAddress
  isSelected: boolean
  isReachable: boolean
  shelf: number
  book: number
  profile: RoomVisualProfile
  onOpenBook: (address: BookAddress) => void
}) {
  const palette = profile.shelf.bookPalette
  const height = profile.shelf.bookHeightBase + ((book + shelf) % 3) * profile.shelf.bookHeightStep
  const color = isSelected ? '#efd15b' : palette[(book + shelf * 2) % palette.length]

  return (
    <mesh
      position={[-shelfWidth / 2 + bookSpacing * (book + 0.5), -0.01, 0.09]}
      onClick={(event) => {
        event.stopPropagation()
        onOpenBook(address)
      }}
    >
      <boxGeometry args={[bookSpacing * profile.shelf.bookWidthScale, height, profile.shelf.bookDepth]} />
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

function RoomPlaques({ profile }: { profile: RoomVisualProfile }) {
  return (
    <>
      {cardinalDirections.map((_, wall) => {
        const transform = wallTransform(wall as DirectionIndex)

        return (
          <group key={`plaque-wall:${wall}`} position={transform.position} rotation={transform.rotation}>
            {profile.plaque.positions.map((x, index) => (
              <WallPlaque key={`${x}:${index}`} x={x} profile={profile} />
            ))}
          </group>
        )
      })}
    </>
  )
}

function WallPlaque({ x, profile }: { x: number; profile: RoomVisualProfile }) {
  const plaque = profile.plaque

  return (
    <group position={[x, plaque.y - ROOM_HEIGHT / 2, 0.04]}>
      <mesh>
        <boxGeometry args={[plaque.width, plaque.height, 0.035]} />
        <meshStandardMaterial color={plaque.frameColor} metalness={0.12} roughness={0.66} />
      </mesh>
      <mesh position={[0, 0, 0.025]}>
        <boxGeometry args={[plaque.width * 0.78, plaque.height * 0.58, 0.018]} />
        <meshStandardMaterial color={plaque.color} metalness={0.08} roughness={0.72} />
      </mesh>
      {[-0.06, 0.06].map((lineY) => (
        <mesh key={lineY} position={[0, lineY, 0.04]}>
          <boxGeometry args={[plaque.width * 0.48, 0.012, 0.012]} />
          <meshStandardMaterial color={plaque.lineColor} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function DustMotes({ profile }: { profile: RoomVisualProfile }) {
  const pointsRef = useRef<THREE.Points>(null)
  const geometry = useMemo(() => {
    const positions = new Float32Array(profile.dust.count * 3)
    for (let index = 0; index < profile.dust.count; index += 1) {
      const seed = index + 1
      positions[index * 3] = seededUnit(seed * 12.9898) * (ROOM_HALF_SIZE - 0.3)
      positions[index * 3 + 1] = 0.32 + Math.abs(seededUnit(seed * 78.233)) * (ROOM_HEIGHT - 0.62)
      positions[index * 3 + 2] = seededUnit(seed * 37.719) * (ROOM_HALF_SIZE - 0.3)
    }

    const nextGeometry = new THREE.BufferGeometry()
    nextGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return nextGeometry
  }, [profile.dust.count])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ clock }) => {
    if (!pointsRef.current) return
    pointsRef.current.rotation.y = Math.sin(clock.elapsedTime * profile.dust.speed) * 0.035
    pointsRef.current.position.y = Math.sin(clock.elapsedTime * profile.dust.speed * 1.7) * 0.018
  })

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color={profile.dust.color}
        size={profile.dust.size}
        transparent
        opacity={profile.dust.opacity}
        depthWrite={false}
      />
    </points>
  )
}

function seededUnit(seed: number): number {
  return (Math.sin(seed) * 43758.5453) % 1
}

function Torch({ position, profile }: { position: [number, number, number]; profile: RoomVisualProfile }) {
  return (
    <group position={position}>
      <mesh position={[0, -0.54, 0]}>
        <boxGeometry args={[0.08, 1.08, 0.08]} />
        <meshStandardMaterial color={profile.lighting.accentColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, -1.1, 0]}>
        <boxGeometry args={[0.5, 0.08, 0.22]} />
        <meshStandardMaterial color="#aaa99e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <coneGeometry args={[0.17, 0.46, 5]} />
        <meshStandardMaterial color={profile.lighting.accentColor} emissive={profile.lighting.accentColor} emissiveIntensity={1.7} />
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
      return { position: [0, ROOM_HEIGHT / 2, -ROOM_HALF_SIZE], rotation: [0, 0, 0] }
    case 1:
      return { position: [ROOM_HALF_SIZE, ROOM_HEIGHT / 2, 0], rotation: [0, -Math.PI / 2, 0] }
    case 2:
      return { position: [0, ROOM_HEIGHT / 2, ROOM_HALF_SIZE], rotation: [0, Math.PI, 0] }
    case 3:
      return { position: [-ROOM_HALF_SIZE, ROOM_HEIGHT / 2, 0], rotation: [0, Math.PI / 2, 0] }
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

function useArenaTextures(roomKind: RoomKind) {
  return useMemo(
    () => {
      const profile = roomVisualProfile(roomKind)

      return {
        wall: makePixelTexture(64, 64, (x, y) => {
          const row = Math.floor(y / 12)
          const offset = row % 2 === 0 ? 0 : 16
          const mortar = y % 12 < 2 || (x + offset) % 32 < 2
          if (mortar) return [...profile.texture.wallMortar]
          const shade = ((x * 7 + y * 11) % profile.texture.noise) - Math.floor(profile.texture.noise / 2)
          return shadeRgb(profile.texture.wallBrick, shade)
        }, [4, 3]),
        floor: makePixelTexture(64, 64, (x, y) => {
          const seam = x % 16 < 2 || y % 16 < 2
          const shade = ((x * 5 + y * 9) % 35) - 17
          return seam ? [...profile.texture.floorSeam] : shadeRgb(profile.texture.floorTile, shade)
        }, [5, 5]),
        ceiling: makePixelTexture(64, 64, (x, y) => {
          const seam = x % 18 < 2 || y % 14 < 2
          const shade = ((x * 13 + y * 3) % 31) - 15
          return seam ? [...profile.texture.ceilingSeam] : shadeRgb(profile.texture.ceilingTile, shade)
        }, [4, 4]),
      }
    },
    [roomKind],
  )
}

function shadeRgb(color: readonly [number, number, number], shade: number): [number, number, number] {
  return [clampByte(color[0] + shade), clampByte(color[1] + shade), clampByte(color[2] + shade)]
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value))
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
