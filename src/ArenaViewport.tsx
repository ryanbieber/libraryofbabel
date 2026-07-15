import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
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
}

export type QuestMarkerState = 'available' | 'active' | 'complete' | null

type ArenaViewportProps = {
  playerPose: PlayerPose
  currentRoom: RoomPosition
  roomName: string
  roomKind: RoomKind
  doors: DirectionIndex[]
  selectedBook: BookAddress
  movementCue: MovementCue
  cameraPitch: number
  jumpOffset: number
  facingLabel: string
  npc: LibraryNpc | null
  questMarker: QuestMarkerState
  canTalkToNpc: boolean
  onOpenBook: (address: BookAddress) => void
  onOpenDoor: (direction: DirectionIndex) => void
  onTalkToNpc: () => void
  onLook: (deltaYaw: number, deltaPitch: number) => void
  onInteract: () => void
  onJump: () => void
  onTouchMoveChange: (movement: HoldMovement) => void
}

const roomSize = ROOM_HALF_SIZE * 2
const shelfWidth = SHELF_WIDTH
const bookSpacing = shelfWidth / BOOKS_PER_SHELF
const shelfBackWidth = shelfWidth + 0.18
const shelfBoardWidth = shelfWidth + 0.2
const doorwayGapWidth = 1.44
const TOUCH_LOOK_SENSITIVITY = 0.006
const MOUSE_LOOK_SENSITIVITY = 0.0048
const CLICK_INTERACT_DEADZONE_PX = 8

export function ArenaViewport({
  playerPose,
  currentRoom,
  roomName,
  roomKind,
  doors,
  selectedBook,
  movementCue,
  cameraPitch,
  jumpOffset,
  facingLabel,
  npc,
  questMarker,
  canTalkToNpc,
  onOpenBook,
  onOpenDoor,
  onTalkToNpc,
  onLook,
  onInteract,
  onJump,
  onTouchMoveChange,
}: ArenaViewportProps) {
  const canUseWebGL = useWebGLAvailable()
  const lookDragRef = useRef<{ pointerId: number; lastX: number; lastY: number; totalDistance: number; isTouch: boolean } | null>(null)
  const onTouchMoveChangeRef = useRef(onTouchMoveChange)
  const hoveredBookRef = useRef<BookAddress | null>(null)
  const [hoveredBook, setHoveredBook] = useState<BookAddress | null>(null)
  const [joystick, setJoystick] = useState({ active: false, x: 0, y: 0 })
  const facing = yawToDirection(playerPose.yaw)

  useEffect(() => {
    onTouchMoveChangeRef.current = onTouchMoveChange
  }, [onTouchMoveChange])

  useEffect(
    () => () => {
      onTouchMoveChangeRef.current({ forward: 0, strafe: 0 })
    },
    [],
  )

  useEffect(() => {
    setHoveredReachableBook(null)
  }, [currentRoom.q, currentRoom.r])

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isPrimaryPointer(event) || isInteractiveTarget(event.target)) return

    const isTouch = event.pointerType !== 'mouse'
    lookDragRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, totalDistance: 0, isTouch }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = lookDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const deltaX = event.clientX - drag.lastX
    const deltaY = event.clientY - drag.lastY
    const sensitivity = drag.isTouch ? TOUCH_LOOK_SENSITIVITY : MOUSE_LOOK_SENSITIVITY
    lookDragRef.current = {
      ...drag,
      lastX: event.clientX,
      lastY: event.clientY,
      totalDistance: drag.totalDistance + Math.hypot(deltaX, deltaY),
    }
    onLook(deltaX * sensitivity, -deltaY * sensitivity)
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = lookDragRef.current
    if (drag?.pointerId === event.pointerId) {
      lookDragRef.current = null
      if (drag.totalDistance <= CLICK_INTERACT_DEADZONE_PX) {
        onInteract()
      }
    }
  }

  function handleJoystickPointer(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    updateJoystick(event)
  }

  function updateJoystick(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const radius = rect.width * 0.38
    const rawX = event.clientX - centerX
    const rawY = event.clientY - centerY
    const distance = Math.hypot(rawX, rawY)
    const scale = distance > radius ? radius / distance : 1
    const x = rawX * scale
    const y = rawY * scale

    setJoystick({ active: true, x, y })
    onTouchMoveChange({
      forward: clampAxis(-y / radius),
      strafe: clampAxis(x / radius),
    })
  }

  function releaseJoystick(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setJoystick({ active: false, x: 0, y: 0 })
    onTouchMoveChange({ forward: 0, strafe: 0 })
  }

  function setHoveredReachableBook(address: BookAddress | null) {
    hoveredBookRef.current = address
    setHoveredBook(address)
  }

  return (
    <div
      className={`arena-viewport movement-${movementCue}`}
      data-testid="arena-viewport"
      data-room-kind={roomKind}
      data-book-hovered={hoveredBook ? 'true' : 'false'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={() => setHoveredReachableBook(null)}
    >
      {canUseWebGL ? (
        <Canvas
          camera={{ fov: 58, position: [0, PLAYER_EYE_HEIGHT, 0], rotation: [0, 0, 0] }}
          dpr={1}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        >
          <ArenaScene
            playerPose={playerPose}
            cameraPitch={cameraPitch}
            jumpOffset={jumpOffset}
            currentRoom={currentRoom}
            roomKind={roomKind}
            doors={doors}
            selectedBook={selectedBook}
            hoveredBook={hoveredBook}
            movementCue={movementCue}
            npc={npc}
            questMarker={questMarker}
            onOpenBook={onOpenBook}
            onHoverBook={setHoveredReachableBook}
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
      <div className="door-strip" aria-label="Room door status">
        {cardinalDirections.map((direction, index) => {
          const doorIndex = index as DirectionIndex
          const isAvailable = doors.includes(doorIndex)
          const className = ['door-chip', isAvailable ? 'available' : 'sealed', index === facing ? 'facing' : ''].join(' ')

          return (
            <span
              key={direction.label}
              className={className}
              aria-label={`${direction.label} door ${isAvailable ? 'available' : 'sealed'}`}
            >
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
      <div className="mobile-landscape-controls" aria-label="Touch controls">
        <div
          className="touch-joystick"
          data-touch-control="true"
          aria-label="Movement joystick"
          onPointerDown={handleJoystickPointer}
          onPointerMove={(event) => {
            if (joystick.active) updateJoystick(event)
          }}
          onPointerUp={releaseJoystick}
          onPointerCancel={releaseJoystick}
        >
          <div className="touch-joystick-knob" style={{ transform: `translate(${joystick.x}px, ${joystick.y}px)` }} />
        </div>
        <div className="touch-actions" data-touch-control="true">
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onInteract}>
            Use
          </button>
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onJump}>
            Jump
          </button>
        </div>
      </div>
      <div className="portrait-lock" aria-label="Rotate device">
        Rotate to landscape
      </div>
    </div>
  )
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, input, textarea, select, a, [data-touch-control="true"]'))
}

function isPrimaryPointer(event: ReactPointerEvent<HTMLDivElement>): boolean {
  const pointerType = event.pointerType as string | undefined
  return event.button === 0 || pointerType !== 'mouse'
}

function clampAxis(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

function ArenaScene({
  playerPose,
  cameraPitch,
  jumpOffset,
  currentRoom,
  roomKind,
  doors,
  selectedBook,
  hoveredBook,
  movementCue,
  npc,
  questMarker,
  onOpenBook,
  onHoverBook,
  onOpenDoor,
  onTalkToNpc,
}: {
  playerPose: PlayerPose
  cameraPitch: number
  jumpOffset: number
  currentRoom: RoomPosition
  roomKind: RoomKind
  doors: DirectionIndex[]
  selectedBook: BookAddress
  hoveredBook: BookAddress | null
  movementCue: MovementCue
  npc: LibraryNpc | null
  questMarker: QuestMarkerState
  onOpenBook: (address: BookAddress) => void
  onHoverBook: (address: BookAddress | null) => void
  onOpenDoor: (direction: DirectionIndex) => void
  onTalkToNpc: () => void
}) {
  const profile = roomVisualProfile(roomKind)
  const textures = useArenaTextures(roomKind)

  return (
    <>
      <PlayerCamera playerPose={playerPose} cameraPitch={cameraPitch} jumpOffset={jumpOffset} movementCue={movementCue} />
      <color attach="background" args={[profile.lighting.background]} />
      <fog attach="fog" args={[profile.lighting.fog, profile.lighting.fogNear, profile.lighting.fogFar]} />
      <ambientLight intensity={profile.lighting.ambientIntensity} />
      <hemisphereLight
        color={profile.lighting.hemisphereColor}
        groundColor={profile.lighting.groundColor}
        intensity={profile.lighting.hemisphereIntensity}
      />
      <pointLight color={profile.lighting.mainColor} intensity={profile.lighting.mainIntensity} position={[0, 2.45, 0]} distance={8} />

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
      <ThemedTorches profile={profile} />
      {cardinalDirections.map((_, wall) => (
        <ShelfWall
          key={`shelf:${wall}`}
          currentRoom={currentRoom}
          wall={wall as DirectionIndex}
          hasDoor={doors.includes(wall as DirectionIndex)}
          profile={profile}
          selectedBook={selectedBook}
          hoveredBook={hoveredBook}
          playerPose={playerPose}
          onOpenBook={onOpenBook}
          onHoverBook={onHoverBook}
          onOpenDoor={onOpenDoor}
        />
      ))}
      <DustMotes profile={profile} />
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

function PlayerCamera({
  playerPose,
  cameraPitch,
  jumpOffset,
  movementCue,
}: {
  playerPose: PlayerPose
  cameraPitch: number
  jumpOffset: number
  movementCue: MovementCue
}) {
  useFrame(({ camera, clock }) => {
    const idleBob = Math.sin(clock.elapsedTime * 2.4) * 0.007
    const stepBob = movementCue === 'step' ? Math.sin(clock.elapsedTime * 20) * 0.018 : 0
    camera.position.set(playerPose.x, PLAYER_EYE_HEIGHT + jumpOffset + idleBob + stepBob, playerPose.z)
    camera.rotation.set(cameraPitch, cameraYawFromPlayerYaw(playerPose.yaw), 0, 'YXZ')
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
  hoveredBook,
  playerPose,
  onOpenBook,
  onHoverBook,
  onOpenDoor,
}: {
  currentRoom: RoomPosition
  wall: DirectionIndex
  hasDoor: boolean
  profile: RoomVisualProfile
  selectedBook: BookAddress
  hoveredBook: BookAddress | null
  playerPose: PlayerPose
  onOpenBook: (address: BookAddress) => void
  onHoverBook: (address: BookAddress | null) => void
  onOpenDoor: (direction: DirectionIndex) => void
}) {
  const shelfWood = useMemo(() => new THREE.Color(profile.shelf.woodColor), [profile.shelf.woodColor])
  const transform = shelfTransform(wall)
  const groupRef = useRef<THREE.Group>(null)

  return (
    <group ref={groupRef} position={transform.position} rotation={transform.rotation}>
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
            const isHovered = hoveredBook !== null && addressLabel(address) === addressLabel(hoveredBook)
            const isReachable = distanceToBook(playerPose, address) <= BOOK_INTERACTION_RADIUS
            const x = bookXPosition(book)
            if (hasDoor && Math.abs(x) < 0.72) return null

            return (
              <BookSpine
                key={`${shelf}:${book}`}
                address={address}
                isSelected={isSelected}
                isHovered={isHovered}
                isReachable={isReachable}
                shelf={shelf}
                book={book}
                profile={profile}
                onOpenBook={onOpenBook}
                onHoverBook={onHoverBook}
              />
            )
          })}
        </group>
      ))}
      <BookHoverPanel
        currentRoom={currentRoom}
        groupRef={groupRef}
        wall={wall}
        hasDoor={hasDoor}
        profile={profile}
        playerPose={playerPose}
        onOpenBook={onOpenBook}
        onHoverBook={onHoverBook}
      />
      {hasDoor ? <Doorway compact parentCenterY={transform.position[1]} onOpen={() => onOpenDoor(wall)} /> : null}
    </group>
  )
}

function BookHoverPanel({
  currentRoom,
  groupRef,
  wall,
  hasDoor,
  profile,
  playerPose,
  onOpenBook,
  onHoverBook,
}: {
  currentRoom: RoomPosition
  groupRef: RefObject<THREE.Group | null>
  wall: DirectionIndex
  hasDoor: boolean
  profile: RoomVisualProfile
  playerPose: PlayerPose
  onOpenBook: (address: BookAddress) => void
  onHoverBook: (address: BookAddress | null) => void
}) {
  const panelHeight = (SHELVES_PER_WALL - 1) * profile.shelf.verticalStep + 0.54
  const panelY = profile.shelf.verticalStart - ((SHELVES_PER_WALL - 1) * profile.shelf.verticalStep) / 2 - 0.02

  function addressFromEvent(event: ThreeEvent<PointerEvent | MouseEvent>): BookAddress | null {
    const group = groupRef.current
    if (!group) return null

    const localPoint = group.worldToLocal(event.point.clone())
    if (Math.abs(localPoint.x) > shelfWidth / 2 || Math.abs(localPoint.y - panelY) > panelHeight / 2) {
      return null
    }

    const shelf = Math.round((profile.shelf.verticalStart - localPoint.y) / profile.shelf.verticalStep)
    if (shelf < 0 || shelf >= SHELVES_PER_WALL) return null

    const book = Math.floor((localPoint.x + shelfWidth / 2) / bookSpacing)
    if (book < 0 || book >= BOOKS_PER_SHELF) return null
    if (hasDoor && Math.abs(bookXPosition(book)) < 0.72) return null

    const address = nearbyBookAddress(currentRoom.q, currentRoom.r, wall, shelf, book)
    return distanceToBook(playerPose, address) <= BOOK_INTERACTION_RADIUS ? address : null
  }

  function updateHover(event: ThreeEvent<PointerEvent>) {
    const address = addressFromEvent(event)
    if (!address) {
      onHoverBook(null)
      return
    }
    stopBookPointerEvent(event)
    onHoverBook(address)
  }

  function openHoveredBook(event: ThreeEvent<PointerEvent | MouseEvent>) {
    const address = addressFromEvent(event)
    if (!address) return
    stopBookPointerEvent(event)
    onHoverBook(address)
    onOpenBook(address)
  }

  return (
    <mesh
      position={[0, panelY, 0.245]}
      onPointerMove={updateHover}
      onPointerOver={updateHover}
      onPointerOut={(event) => {
        stopBookPointerEvent(event)
        onHoverBook(null)
      }}
      onPointerDown={(event) => {
        const address = addressFromEvent(event)
        if (!address) return
        stopBookPointerEvent(event)
        onHoverBook(address)
      }}
      onClick={openHoveredBook}
    >
      <planeGeometry args={[shelfWidth, panelHeight]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
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
  isHovered,
  isReachable,
  shelf,
  book,
  profile,
  onOpenBook,
  onHoverBook,
}: {
  address: BookAddress
  isSelected: boolean
  isHovered: boolean
  isReachable: boolean
  shelf: number
  book: number
  profile: RoomVisualProfile
  onOpenBook: (address: BookAddress) => void
  onHoverBook: (address: BookAddress | null) => void
}) {
  const palette = profile.shelf.bookPalette
  const baseHeight = profile.shelf.bookHeightBase + ((book + shelf) % 3) * profile.shelf.bookHeightStep
  const height = isHovered ? baseHeight + 0.05 : baseHeight
  const color = isHovered ? '#fff1a8' : isSelected ? '#efd15b' : palette[(book + shelf * 2) % palette.length]
  const depth = isHovered ? profile.shelf.bookDepth + 0.055 : profile.shelf.bookDepth
  const z = isHovered ? 0.13 : 0.09

  return (
    <mesh
      position={[-shelfWidth / 2 + bookSpacing * (book + 0.5), -0.01, z]}
      onPointerOver={(event) => {
        if (!isReachable) return
        stopBookPointerEvent(event)
        onHoverBook(address)
      }}
      onPointerOut={(event) => {
        if (!isReachable) return
        stopBookPointerEvent(event)
        onHoverBook(null)
      }}
      onPointerDown={(event) => {
        if (!isReachable) return
        stopBookPointerEvent(event)
      }}
      onClick={(event) => {
        if (!isReachable) return
        stopBookPointerEvent(event)
        onOpenBook(address)
      }}
    >
      <boxGeometry args={[bookSpacing * profile.shelf.bookWidthScale, height, depth]} />
      <meshStandardMaterial
        color={color}
        roughness={isHovered ? 0.55 : 0.85}
        emissive={isHovered ? '#5a3b00' : isSelected || isReachable ? '#302000' : '#000000'}
        emissiveIntensity={isHovered ? 1 : isReachable ? 0.45 : 0.2}
      />
    </mesh>
  )
}

function stopBookPointerEvent(event: ThreeEvent<PointerEvent | MouseEvent>) {
  event.stopPropagation()
  event.nativeEvent.stopPropagation()
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

function ThemedTorches({ profile }: { profile: RoomVisualProfile }) {
  return (
    <>
      {profile.torches.positions.map((position) => (
        <Torch key={position.join(':')} position={position} profile={profile} />
      ))}
    </>
  )
}

function Torch({ position, profile }: { position: readonly [number, number, number]; profile: RoomVisualProfile }) {
  const torch = profile.torches
  const lightRef = useRef<THREE.PointLight>(null)
  const flameRef = useRef<THREE.Group>(null)
  const outerMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const coreMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const haloMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const flickerSeed = Math.abs(position[0] * 1.7 + position[1] * 2.9 + position[2] * 3.7)

  useFrame(({ clock }) => {
    const time = clock.elapsedTime + flickerSeed
    const flicker = 0.88 + Math.sin(time * 8.7) * 0.08 + Math.sin(time * 17.1) * 0.045
    if (lightRef.current) {
      lightRef.current.intensity = torch.lightIntensity * flicker
    }
    if (flameRef.current) {
      flameRef.current.scale.set(0.9 + flicker * 0.1, 0.78 + flicker * 0.26, 0.9 + flicker * 0.08)
      flameRef.current.rotation.y = Math.sin(time * 5.2) * 0.14
    }
    if (outerMaterialRef.current) {
      outerMaterialRef.current.opacity = 0.48 + flicker * 0.22
    }
    if (coreMaterialRef.current) {
      coreMaterialRef.current.opacity = 0.62 + flicker * 0.26
    }
    if (haloMaterialRef.current) {
      haloMaterialRef.current.opacity = 0.08 + flicker * 0.1
    }
  })

  return (
    <group position={[position[0], position[1], position[2]]}>
      <pointLight
        ref={lightRef}
        color={torch.flameColor}
        intensity={torch.lightIntensity}
        distance={torch.lightDistance}
        position={[0, 0.16, 0]}
      />
      <mesh position={[0, -0.54, 0]}>
        <boxGeometry args={[0.08, 1.08, 0.08]} />
        <meshStandardMaterial color={torch.stemColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, -1.1, 0]}>
        <boxGeometry args={[0.5, 0.08, 0.22]} />
        <meshStandardMaterial color={torch.baseColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.18, 0.12, 0.16, 8]} />
        <meshStandardMaterial color={torch.baseColor} metalness={0.15} roughness={0.62} />
      </mesh>
      <group ref={flameRef}>
        <mesh position={[0, 0.22, 0]} scale={[torch.flameScale * 0.72, torch.flameScale, torch.flameScale * 0.72]}>
          <coneGeometry args={[0.2, 0.56, 9, 1, true]} />
          <meshBasicMaterial
            ref={outerMaterialRef}
            color={torch.flameColor}
            transparent
            opacity={0.66}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh position={[0, 0.2, 0]} scale={[torch.flameScale * 0.42, torch.flameScale * 0.82, torch.flameScale * 0.42]}>
          <coneGeometry args={[0.16, 0.46, 8, 1, true]} />
          <meshBasicMaterial
            ref={coreMaterialRef}
            color={torch.coreColor}
            transparent
            opacity={0.82}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh position={[0, 0.06, 0]} scale={[torch.flameScale * 0.54, torch.flameScale * 0.34, torch.flameScale * 0.54]}>
          <sphereGeometry args={[0.18, 12, 8]} />
          <meshBasicMaterial color={torch.coreColor} transparent opacity={0.72} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh position={[0, 0.16, 0]} scale={torch.flameScale}>
          <sphereGeometry args={[0.24, 10, 8]} />
          <meshBasicMaterial
            ref={haloMaterialRef}
            color={torch.haloColor}
            transparent
            opacity={0.18}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
    </group>
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
