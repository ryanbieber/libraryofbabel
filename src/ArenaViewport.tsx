import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { FIRST_PERSON_CAMERA_ORDER, cameraYawFromPlayerYaw } from './lib/camera'
import { galleriesForConnector, signedLabel, zoneLabel } from './lib/level'
import {
  BOOKS_PER_SHELF,
  SHELF_WALLS,
  SHELVES_PER_WALL,
  addressKey,
  nearbyBookAddress,
  type BookAddress,
  type ShelfWall,
} from './lib/library'
import type { LibraryNpc } from './lib/npcs'
import { shouldBookCapturePointer } from './lib/pointer'
import { visibleScenesForPose } from './lib/sceneVisibility'
import {
  BOOK_INTERACTION_RADIUS,
  FLOOR_HEIGHT,
  GALLERY_APOTHEM,
  GALLERY_RADIUS,
  LIGHTWELL_RADIUS,
  PLAYER_EYE_HEIGHT,
  RAILING_HEIGHT,
  SHELF_WIDTH,
  VESTIBULE_HALF_DEPTH,
  VESTIBULE_HALF_WIDTH,
  distanceToBook,
  stairCameraPose,
  wallNormal,
  type PlayerPose,
} from './lib/roomGeometry'

type MovementCue = 'idle' | 'step' | 'turn-left' | 'turn-right'
type HoldMovement = { forward: number; strafe: number }
export type QuestMarkerState = 'available' | 'complete' | 'inquiry' | null
export type SceneNpc = { npc: LibraryNpc; questMarker: QuestMarkerState }

type ArenaViewportProps = {
  playerPose: PlayerPose
  presentedBook: BookAddress | null
  movementCue: MovementCue
  cameraPitch: number
  jumpOffset: number
  npcStates: SceneNpc[]
  talkableNpcId: string | null
  onOpenBook: (address: BookAddress) => void
  onTalkToNpc: (npc: LibraryNpc) => void
  onLook: (deltaYaw: number, deltaPitch: number) => void
  onInteract: () => void
  onJump: () => void
  onTouchMoveChange: (movement: HoldMovement) => void
}

const ROOM_HEIGHT = 3.08
const TOUCH_LOOK_SENSITIVITY = 0.006
const MOUSE_LOOK_SENSITIVITY = 0.0048
const CLICK_INTERACT_DEADZONE_PX = 8
const BOOK_PULL_DISTANCE = 0.42
const BOOK_PRESENTATION_ANGLE = Math.PI / 4
const LEATHER_COLORS = ['#32140f', '#482116', '#2b2416', '#182321', '#20212a', '#3a2919', '#241713'] as const
const SPINE_BAND_HEIGHT_RATIOS = [-0.31, 0.31] as const

export function ArenaViewport({
  playerPose,
  presentedBook,
  movementCue,
  cameraPitch,
  jumpOffset,
  npcStates,
  talkableNpcId,
  onOpenBook,
  onTalkToNpc,
  onLook,
  onInteract,
  onJump,
  onTouchMoveChange,
}: ArenaViewportProps) {
  const canUseWebGL = useWebGLAvailable()
  const talkableNpcState = npcStates.find(({ npc }) => npc.id === talkableNpcId) ?? null
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number; totalDistance: number; isTouch: boolean } | null>(null)
  const onTouchMoveChangeRef = useRef(onTouchMoveChange)
  const hoveredBookRef = useRef<BookAddress | null>(null)
  const [hoveredBook, setHoveredBook] = useState<BookAddress | null>(null)
  const [joystick, setJoystick] = useState({ active: false, x: 0, y: 0 })

  useEffect(() => { onTouchMoveChangeRef.current = onTouchMoveChange }, [onTouchMoveChange])
  useEffect(() => () => onTouchMoveChangeRef.current({ forward: 0, strafe: 0 }), [])

  useEffect(() => setHoveredReachableBook(null), [playerPose.floor, playerPose.zone])

  function setHoveredReachableBook(address: BookAddress | null) {
    hoveredBookRef.current = address
    setHoveredBook(address)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isPrimaryPointer(event) || isInteractiveTarget(event.target)) return
    const isTouch = event.pointerType !== 'mouse'
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, totalDistance: 0, isTouch }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.lastX
    const deltaY = event.clientY - drag.lastY
    const sensitivity = drag.isTouch ? TOUCH_LOOK_SENSITIVITY : MOUSE_LOOK_SENSITIVITY
    dragRef.current = { ...drag, lastX: event.clientX, lastY: event.clientY, totalDistance: drag.totalDistance + Math.hypot(deltaX, deltaY) }
    onLook(deltaX * sensitivity, -deltaY * sensitivity)
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (drag?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (drag.totalDistance <= CLICK_INTERACT_DEADZONE_PX) onInteract()
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
    onTouchMoveChange({ forward: clampAxis(-y / radius), strafe: clampAxis(x / radius) })
  }

  function releaseJoystick(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault(); event.stopPropagation()
    setJoystick({ active: false, x: 0, y: 0 })
    onTouchMoveChange({ forward: 0, strafe: 0 })
  }

  return (
    <div
      className={`arena-viewport movement-${movementCue}`}
      data-testid="arena-viewport"
      data-zone={playerPose.zone.kind}
      data-book-hovered={hoveredBook ? 'true' : 'false'}
      data-book-presented={presentedBook ? addressKey(presentedBook) : ''}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={() => setHoveredReachableBook(null)}
    >
      {canUseWebGL ? (
        <Canvas
          camera={{ fov: 58, position: [playerPose.x, PLAYER_EYE_HEIGHT, playerPose.z] }}
          dpr={[1, 1.35]}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        >
          <LibraryScene
            playerPose={playerPose}
            cameraPitch={cameraPitch}
            jumpOffset={jumpOffset}
            presentedBook={presentedBook}
            hoveredBook={hoveredBook}
            movementCue={movementCue}
            npcStates={npcStates}
            onOpenBook={onOpenBook}
            onHoverBook={setHoveredReachableBook}
            onTalkToNpc={onTalkToNpc}
          />
        </Canvas>
      ) : <div className="arena-canvas-unavailable" aria-label="WebGL unavailable" />}

      <div className="arena-crosshair" aria-hidden="true" />
      <div className="room-label" aria-label="Current location">
        <strong>{zoneLabel(playerPose.zone)}</strong>
        <span>Floor {signedLabel(playerPose.floor)}</span>
      </div>
      {playerPose.zone.kind === 'vestibule' ? (
        <div className="zone-help" aria-hidden="true">{vestibuleHelp(playerPose.floor)}</div>
      ) : null}
      {talkableNpcState ? (
        <button type="button" className="npc-talk-button" aria-label={`Talk to ${talkableNpcState.npc.name}`} onClick={() => onTalkToNpc(talkableNpcState.npc)}>Talk</button>
      ) : null}
      {talkableNpcState?.questMarker ? (
        <div className={`npc-quest-marker ${talkableNpcState.questMarker}`} aria-hidden="true">{talkableNpcState.questMarker === 'available' ? '!' : '?'}</div>
      ) : null}
      <div className="mobile-landscape-controls" aria-label="Touch controls">
        <div
          className="touch-joystick"
          data-touch-control="true"
          aria-label="Movement joystick"
          onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture?.(event.pointerId); updateJoystick(event) }}
          onPointerMove={(event) => { if (joystick.active) updateJoystick(event) }}
          onPointerUp={releaseJoystick}
          onPointerCancel={releaseJoystick}
        >
          <div className="touch-joystick-knob" style={{ transform: `translate(${joystick.x}px, ${joystick.y}px)` }} />
        </div>
        <div className="touch-actions" data-touch-control="true">
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onJump}>Jump</button>
        </div>
      </div>
      <div className="portrait-lock" aria-label="Rotate device">Rotate to landscape</div>
    </div>
  )
}

function LibraryScene({
  playerPose,
  cameraPitch,
  jumpOffset,
  presentedBook,
  hoveredBook,
  movementCue,
  npcStates,
  onOpenBook,
  onHoverBook,
  onTalkToNpc,
}: {
  playerPose: PlayerPose
  cameraPitch: number
  jumpOffset: number
  presentedBook: BookAddress | null
  hoveredBook: BookAddress | null
  movementCue: MovementCue
  npcStates: SceneNpc[]
  onOpenBook: (address: BookAddress) => void
  onHoverBook: (address: BookAddress | null) => void
  onTalkToNpc: (npc: LibraryNpc) => void
}) {
  const visibleScenes = visibleScenesForPose(playerPose)
  return (
    <>
      <PlayerCamera playerPose={playerPose} movementCue={movementCue} cameraPitch={cameraPitch} jumpOffset={jumpOffset} />
      <color attach="background" args={['#0d0b09']} />
      <fog attach="fog" args={['#0d0b09', 8, 22]} />
      <ambientLight intensity={0.58} color="#c7b99f" />
      <hemisphereLight color="#f2d9a3" groundColor="#241a12" intensity={0.7} />
      <directionalLight color="#ffe2aa" intensity={0.78} position={[4, 7, 3]} />
      <pointLight color="#ffc76f" intensity={30} position={[0, 2.55, 0]} distance={12} decay={1.8} />
      {visibleScenes.map((scene) => (
        <group key={scene.id} position={scene.position}>
          {scene.zone.kind === 'gallery' ? (
            <GalleryScene
              floor={scene.floor}
              playerPose={playerPose}
              gallery={scene.zone.gallery}
              presentedBook={presentedBook}
              hoveredBook={scene.isCurrent ? hoveredBook : null}
              interactive={scene.isCurrent}
              npcStates={scene.isCurrent ? npcStates : []}
              onOpenBook={onOpenBook}
              onHoverBook={onHoverBook}
              onTalkToNpc={onTalkToNpc}
            />
          ) : null}
          {scene.zone.kind === 'vestibule' ? <VestibuleScene connector={scene.zone.connector} /> : null}
          {scene.zone.kind === 'service' ? <ServiceRoomScene room={scene.zone.room} /> : null}
          {scene.zone.kind === 'stair' ? <StairScene ascending={scene.zone.to > scene.zone.from} /> : null}
        </group>
      ))}
      <DustMotes zone={playerPose.zone.kind} />
    </>
  )
}

function GalleryScene({
  floor,
  playerPose,
  gallery,
  presentedBook,
  hoveredBook,
  interactive,
  npcStates,
  onOpenBook,
  onHoverBook,
  onTalkToNpc,
}: {
  floor: BookAddress['floor']
  playerPose: PlayerPose
  gallery: BookAddress['gallery']
  presentedBook: BookAddress | null
  hoveredBook: BookAddress | null
  interactive: boolean
  npcStates: SceneNpc[]
  onOpenBook: (address: BookAddress) => void
  onHoverBook: (address: BookAddress | null) => void
  onTalkToNpc: (npc: LibraryNpc) => void
}) {
  const floorShape = useMemo(() => makeGalleryShape(), [])
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <shapeGeometry args={[floorShape]} />
        <meshStandardMaterial color="#494039" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM_HEIGHT, 0]}>
        <shapeGeometry args={[floorShape]} />
        <meshStandardMaterial color="#2f2a26" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -FLOOR_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[LIGHTWELL_RADIUS, LIGHTWELL_RADIUS, FLOOR_HEIGHT * 3, 24, 1, true]} />
        <meshStandardMaterial color="#050404" side={THREE.BackSide} />
      </mesh>
      <LightwellRailing />
      <PassageFrame z={-GALLERY_APOTHEM} />
      <PassageFrame z={GALLERY_APOTHEM} rotationY={Math.PI} />
      {SHELF_WALLS.map((wall) => (
        <ShelfWall
          key={wall}
          floor={floor}
          gallery={gallery}
          wall={wall}
          playerPose={playerPose}
          presentedBook={presentedBook}
          hoveredBook={hoveredBook}
          interactive={interactive}
          onOpenBook={onOpenBook}
          onHoverBook={onHoverBook}
        />
      ))}
      <ReadingTable position={[-2.35, 0, 0.65]} />
      {npcStates.some(({ npc }) => npc.quest === 'word-finder') ? <ReadingTable position={[2.35, 0, -0.65]} /> : null}
      {npcStates.map(({ npc, questMarker }) => (
        <SeatedMonk key={npc.id} npc={npc} questMarker={questMarker} onTalk={() => onTalkToNpc(npc)} />
      ))}
      <WarmLamp position={[2.7, 0, -2.2]} />
      <WarmLamp position={[-2.7, 0, 2.2]} />
    </>
  )
}

function ShelfWall({
  floor,
  gallery,
  wall,
  playerPose,
  presentedBook,
  hoveredBook,
  interactive,
  onOpenBook,
  onHoverBook,
}: {
  floor: BookAddress['floor']
  gallery: BookAddress['gallery']
  wall: ShelfWall
  playerPose: PlayerPose
  presentedBook: BookAddress | null
  hoveredBook: BookAddress | null
  interactive: boolean
  onOpenBook: (address: BookAddress) => void
  onHoverBook: (address: BookAddress | null) => void
}) {
  const normal = wallNormal(wall)
  const angle = Math.atan2(normal[0], normal[1])
  return (
    <group position={[normal[0] * GALLERY_APOTHEM, ROOM_HEIGHT / 2, normal[1] * GALLERY_APOTHEM]} rotation={[0, angle, 0]}>
      <mesh>
        <planeGeometry args={[GALLERY_RADIUS, ROOM_HEIGHT]} />
        <meshStandardMaterial color="#342921" roughness={0.96} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.02, -0.1]}>
        <boxGeometry args={[SHELF_WIDTH + 0.24, 2.76, 0.2]} />
        <meshStandardMaterial color="#3e2417" roughness={1} />
      </mesh>
      {Array.from({ length: SHELVES_PER_WALL + 1 }, (_, shelf) => (
        <mesh key={shelf} position={[0, 1.18 - shelf * 0.49, -0.24]}>
          <boxGeometry args={[SHELF_WIDTH + 0.28, 0.08, 0.36]} />
          <meshStandardMaterial color="#6a4025" roughness={0.94} />
        </mesh>
      ))}
      <InstancedBooks
        floor={floor}
        gallery={gallery}
        wall={wall}
        playerPose={playerPose}
        presentedBook={presentedBook}
        hoveredBook={hoveredBook}
        interactive={interactive}
        onOpenBook={onOpenBook}
        onHoverBook={onHoverBook}
      />
    </group>
  )
}

function InstancedBooks({
  floor,
  gallery,
  wall,
  playerPose,
  presentedBook,
  hoveredBook,
  interactive,
  onOpenBook,
  onHoverBook,
}: {
  floor: BookAddress['floor']
  gallery: BookAddress['gallery']
  wall: ShelfWall
  playerPose: PlayerPose
  presentedBook: BookAddress | null
  hoveredBook: BookAddress | null
  interactive: boolean
  onOpenBook: (address: BookAddress) => void
  onHoverBook: (address: BookAddress | null) => void
}) {
  const count = SHELVES_PER_WALL * BOOKS_PER_SHELF
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const toolingRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const toolingDummy = useMemo(() => new THREE.Object3D(), [])
  const animatedInstanceRef = useRef<number | null>(null)
  const presentationProgressRef = useRef(0)
  const presentedInstance = useMemo(() => {
    if (
      presentedBook === null
      || presentedBook.floor !== floor
      || presentedBook.gallery !== gallery
      || presentedBook.wall !== wall
    ) return null
    return presentedBook.shelf * BOOKS_PER_SHELF + presentedBook.book
  }, [floor, gallery, presentedBook, wall])

  const setBookTransform = useCallback((instance: number, presentation: number) => {
    const mesh = meshRef.current
    const tooling = toolingRef.current
    if (!mesh || !tooling) return

    const shelf = Math.floor(instance / BOOKS_PER_SHELF)
    const book = instance % BOOKS_PER_SHELF
    const cellWidth = SHELF_WIDTH / BOOKS_PER_SHELF
    const width = cellWidth * 0.82
    const variationSeed = Math.abs(instance * 17 + gallery * 11 + floor * 7)
    const height = 0.34 + (variationSeed % 9) * 0.009
    const baseX = -SHELF_WIDTH / 2 + (book + 0.5) * cellWidth
    const baseY = 1.03 - shelf * 0.49
    const pullProgress = easeOutCubic(Math.min(1, presentation / 0.72))
    const turnProgress = smoothStep(Math.max(0, (presentation - 0.28) / 0.72))
    const angle = BOOK_PRESENTATION_ANGLE * turnProgress
    const z = -0.31 - BOOK_PULL_DISTANCE * pullProgress

    dummy.position.set(baseX, baseY, z)
    dummy.rotation.set(0, angle, 0)
    dummy.scale.set(width, height, 0.13)
    dummy.updateMatrix()
    mesh.setMatrixAt(instance, dummy.matrix)

    const spineOffset = 0.073
    const toolingX = baseX + Math.sin(angle) * spineOffset
    const toolingZ = z + Math.cos(angle) * spineOffset
    SPINE_BAND_HEIGHT_RATIOS.forEach((heightRatio, band) => {
      toolingDummy.position.set(toolingX, baseY + height * heightRatio, toolingZ)
      toolingDummy.rotation.set(0, angle, 0)
      toolingDummy.scale.set(width * 0.72, 0.012, 0.008)
      toolingDummy.updateMatrix()
      tooling.setMatrixAt(instance * 2 + band, toolingDummy.matrix)
    })
  }, [dummy, floor, gallery, toolingDummy])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    const tooling = toolingRef.current
    if (!mesh || !tooling) return
    for (let instance = 0; instance < count; instance += 1) {
      setBookTransform(instance, 0)
    }
    mesh.instanceMatrix.needsUpdate = true
    tooling.instanceMatrix.needsUpdate = true
  }, [count, setBookTransform])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const activeKey = presentedBook === null ? null : addressKey(presentedBook)
    for (let instance = 0; instance < count; instance += 1) {
      const address = addressFromInstance(floor, gallery, wall, instance)
      const key = addressKey(address)
      const active = key === activeKey
      const hovered = hoveredBook !== null && key === addressKey(hoveredBook)
      const paletteSeed = Math.abs(instance * 7 + gallery * 5 + floor * 3 + SHELF_WALLS.indexOf(wall) * 11)
      const color = new THREE.Color(LEATHER_COLORS[paletteSeed % LEATHER_COLORS.length])
      if (hovered) color.offsetHSL(0, 0.04, 0.16)
      else if (active) color.offsetHSL(0, 0.02, 0.08)
      mesh.setColorAt(instance, color)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [count, floor, gallery, hoveredBook, presentedBook, wall])

  useFrame((_, delta) => {
    if (presentedInstance !== null && animatedInstanceRef.current !== presentedInstance) {
      if (animatedInstanceRef.current !== null) setBookTransform(animatedInstanceRef.current, 0)
      animatedInstanceRef.current = presentedInstance
      presentationProgressRef.current = 0
    }

    const animatedInstance = animatedInstanceRef.current
    if (animatedInstance === null) return
    const target = presentedInstance === animatedInstance ? 1 : 0
    const nextProgress = THREE.MathUtils.damp(presentationProgressRef.current, target, 6.5, delta)
    presentationProgressRef.current = Math.abs(nextProgress - target) < 0.001 ? target : nextProgress
    setBookTransform(animatedInstance, presentationProgressRef.current)
    if (meshRef.current) meshRef.current.instanceMatrix.needsUpdate = true
    if (toolingRef.current) toolingRef.current.instanceMatrix.needsUpdate = true

    if (target === 0 && presentationProgressRef.current === 0) {
      animatedInstanceRef.current = null
    }
  })

  function addressForEvent(event: ThreeEvent<PointerEvent | MouseEvent>): BookAddress | null {
    return event.instanceId === undefined ? null : addressFromInstance(floor, gallery, wall, event.instanceId)
  }

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, count]}
        onPointerMove={interactive ? (event) => {
          if (!shouldBookCapturePointer(eventPointerType(event))) { onHoverBook(null); return }
          event.stopPropagation()
          const address = addressForEvent(event)
          onHoverBook(address && distanceToBook(playerPose, address) <= BOOK_INTERACTION_RADIUS ? address : null)
        } : undefined}
        onPointerOut={interactive ? () => onHoverBook(null) : undefined}
        onClick={interactive ? (event) => {
          if (shouldBookCapturePointer(eventPointerType(event))) event.stopPropagation()
          const address = addressForEvent(event)
          if (address) onOpenBook(address)
        } : undefined}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.84} metalness={0.03} />
      </instancedMesh>
      <instancedMesh ref={toolingRef} args={[undefined, undefined, count * 2]} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#b68a3a" roughness={0.38} metalness={0.58} />
      </instancedMesh>
    </>
  )
}

function VestibuleScene({ connector }: { connector: number }) {
  const neighbors = galleriesForConnector(connector as Parameters<typeof galleriesForConnector>[0])
  return (
    <>
      <BoxRoom width={VESTIBULE_HALF_WIDTH * 2} depth={VESTIBULE_HALF_DEPTH * 2} color="#403933" openNorth openSouth openWest openEast />
      <CorridorEnd z={-VESTIBULE_HALF_DEPTH} gated={neighbors.north === null} />
      <CorridorEnd z={VESTIBULE_HALF_DEPTH} gated={neighbors.south === null} rotationY={Math.PI} />
      <SidePortal side="west" z={-0.72} labelColor="#897151" />
      <SidePortal side="west" z={0.72} labelColor="#6d5944" />
      <SidePortal side="east" z={0} labelColor="#a67d36" wide />
      <Mirror position={[-2.56, 1.58, 0]} rotationY={Math.PI / 2} />
      <WarmLamp position={[0, 0, 0]} />
    </>
  )
}

function ServiceRoomScene({ room }: { room: 'sleeping' | 'latrine' }) {
  return (
    <>
      <BoxRoom width={3.6} depth={2.8} color={room === 'sleeping' ? '#322a25' : '#393a35'} openEast />
      <SidePortal side="east" z={0} labelColor="#735a3c" wide />
      {room === 'sleeping' ? <SleepingCloset /> : <Latrine />}
      <WarmLamp position={[-0.8, 0, 0]} />
    </>
  )
}

function StairScene({ ascending }: { ascending: boolean }) {
  const steps = 40
  return (
    <>
      <mesh position={[0, FLOOR_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[2.55, 2.55, FLOOR_HEIGHT, 24, 1, true]} />
        <meshStandardMaterial color="#292522" roughness={1} side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, FLOOR_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.43, 0.43, FLOOR_HEIGHT, 12]} />
        <meshStandardMaterial color="#171311" roughness={0.96} />
      </mesh>
      {Array.from({ length: steps }, (_, index) => {
        const progress = index / (steps - 1)
        const angle = -Math.PI / 2 + progress * Math.PI * 2
        const y = progress * FLOOR_HEIGHT
        return (
          <group key={index} position={[Math.cos(angle) * 1.38, y, Math.sin(angle) * 1.38]} rotation={[0, -angle, 0]}>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[1.45, 0.09, 0.42]} />
              <meshStandardMaterial color={index % 2 ? '#5a5047' : '#665a4f'} roughness={1} />
            </mesh>
            <mesh position={[0.67, RAILING_HEIGHT / 2, 0]}>
              <boxGeometry args={[0.05, RAILING_HEIGHT, 0.05]} />
              <meshStandardMaterial color="#8b6b35" metalness={0.35} roughness={0.7} />
            </mesh>
          </group>
        )
      })}
      <pointLight color="#ffc05c" intensity={22} distance={9} decay={1.8} position={[0, ascending ? FLOOR_HEIGHT * 0.7 : FLOOR_HEIGHT * 0.3, 0]} />
    </>
  )
}

function PlayerCamera({
  playerPose,
  movementCue,
  cameraPitch,
  jumpOffset,
}: {
  playerPose: PlayerPose
  movementCue: MovementCue
  cameraPitch: number
  jumpOffset: number
}) {
  useFrame(({ camera, clock }) => {
    const transform = stairCameraPose(playerPose)
    const idleBob = Math.sin(clock.elapsedTime * 2.4) * 0.007
    const stepBob = movementCue === 'step' ? Math.sin(clock.elapsedTime * 20) * 0.018 : 0
    camera.position.set(transform.x, transform.y + PLAYER_EYE_HEIGHT + jumpOffset + idleBob + stepBob, transform.z)
    camera.rotation.set(cameraPitch, cameraYawFromPlayerYaw(transform.yaw), 0, FIRST_PERSON_CAMERA_ORDER)
  })
  return null
}

function LightwellRailing() {
  const segments = 16
  return (
    <group>
      {Array.from({ length: segments }, (_, index) => {
        const angle = index / segments * Math.PI * 2
        const radius = LIGHTWELL_RADIUS + 0.14
        return (
          <group key={index} position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]} rotation={[0, -angle, 0]}>
            <mesh position={[0, RAILING_HEIGHT / 2, 0]}>
              <boxGeometry args={[0.045, RAILING_HEIGHT, 0.045]} />
              <meshStandardMaterial color="#92703a" metalness={0.38} roughness={0.66} />
            </mesh>
            <mesh position={[0, RAILING_HEIGHT, 0]}>
              <boxGeometry args={[0.54, 0.07, 0.07]} />
              <meshStandardMaterial color="#92703a" metalness={0.38} roughness={0.66} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function PassageFrame({ z, rotationY = 0, totalWidth = GALLERY_RADIUS }: { z: number; rotationY?: number; totalWidth?: number }) {
  const openingWidth = 1.5
  const sideWidth = (totalWidth - openingWidth) / 2
  const sideCenter = openingWidth / 2 + sideWidth / 2
  return (
    <group position={[0, 0, z]} rotation={[0, rotationY, 0]}>
      <mesh position={[-sideCenter, ROOM_HEIGHT / 2, 0]}><boxGeometry args={[sideWidth, ROOM_HEIGHT, 0.28]} /><meshStandardMaterial color="#38312b" roughness={1} /></mesh>
      <mesh position={[sideCenter, ROOM_HEIGHT / 2, 0]}><boxGeometry args={[sideWidth, ROOM_HEIGHT, 0.28]} /><meshStandardMaterial color="#38312b" roughness={1} /></mesh>
      <mesh position={[0, 2.72, 0]}><boxGeometry args={[openingWidth, 0.72, 0.28]} /><meshStandardMaterial color="#38312b" roughness={1} /></mesh>
    </group>
  )
}

function CorridorEnd({ z, gated, rotationY = 0 }: { z: number; gated: boolean; rotationY?: number }) {
  return (
    <group position={[0, 0, z]} rotation={[0, rotationY, 0]}>
      <PassageFrame z={0} totalWidth={VESTIBULE_HALF_WIDTH * 2} />
      {gated ? Array.from({ length: 7 }, (_, index) => (
        <mesh key={index} position={[-0.6 + index * 0.2, 1.12, -0.04]}>
          <boxGeometry args={[0.035, 2.2, 0.05]} />
          <meshStandardMaterial color="#5d4a31" metalness={0.45} roughness={0.72} />
        </mesh>
      )) : null}
    </group>
  )
}

function SidePortal({ side, z, labelColor, wide = false }: { side: 'east' | 'west'; z: number; labelColor: string; wide?: boolean }) {
  const x = side === 'east' ? VESTIBULE_HALF_WIDTH : -VESTIBULE_HALF_WIDTH
  return (
    <group position={[x, 0, z]} rotation={[0, side === 'east' ? -Math.PI / 2 : Math.PI / 2, 0]}>
      <mesh position={[0, 2.5, -0.02]}><boxGeometry args={[wide ? 1.65 : 1.05, 0.25, 0.18]} /><meshStandardMaterial color={labelColor} /></mesh>
    </group>
  )
}

function BoxRoom({
  width,
  depth,
  color,
  openNorth = false,
  openSouth = false,
  openWest = false,
  openEast = false,
}: {
  width: number
  depth: number
  color: string
  openNorth?: boolean
  openSouth?: boolean
  openWest?: boolean
  openEast?: boolean
}) {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[width, depth]} /><meshStandardMaterial color="#4a443e" roughness={1} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM_HEIGHT, 0]}><planeGeometry args={[width, depth]} /><meshStandardMaterial color="#292622" roughness={1} side={THREE.DoubleSide} /></mesh>
      {!openNorth ? <mesh position={[0, ROOM_HEIGHT / 2, -depth / 2]}><planeGeometry args={[width, ROOM_HEIGHT]} /><meshStandardMaterial color={color} side={THREE.DoubleSide} /></mesh> : null}
      {!openSouth ? <mesh position={[0, ROOM_HEIGHT / 2, depth / 2]} rotation={[0, Math.PI, 0]}><planeGeometry args={[width, ROOM_HEIGHT]} /><meshStandardMaterial color={color} side={THREE.DoubleSide} /></mesh> : null}
      {!openWest ? <mesh position={[-width / 2, ROOM_HEIGHT / 2, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[depth, ROOM_HEIGHT]} /><meshStandardMaterial color={color} side={THREE.DoubleSide} /></mesh> : null}
      {!openEast ? <mesh position={[width / 2, ROOM_HEIGHT / 2, 0]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[depth, ROOM_HEIGHT]} /><meshStandardMaterial color={color} side={THREE.DoubleSide} /></mesh> : null}
    </>
  )
}

function ReadingTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.72, 0]}><boxGeometry args={[1.35, 0.14, 0.72]} /><meshStandardMaterial color="#59402b" roughness={0.92} /></mesh>
      {[-0.5, 0.5].flatMap((x) => [-0.23, 0.23].map((z) => <mesh key={`${x}:${z}`} position={[x, 0.35, z]}><boxGeometry args={[0.11, 0.7, 0.11]} /><meshStandardMaterial color="#3d2a1e" /></mesh>))}
      <mesh position={[0, 0.82, 0]} rotation={[-0.08, 0, 0]}><boxGeometry args={[0.55, 0.03, 0.38]} /><meshStandardMaterial color="#d1b776" emissive="#3a2500" emissiveIntensity={0.25} /></mesh>
    </group>
  )
}

function SeatedMonk({ npc, questMarker, onTalk }: { npc: LibraryNpc; questMarker: QuestMarkerState; onTalk: () => void }) {
  const groupRef = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (groupRef.current) groupRef.current.position.y = Math.sin(clock.elapsedTime * 1.7) * 0.016 })
  return (
    <group position={[npc.position.x, 0.55, npc.position.z - 0.42]} rotation={[0, Math.PI, 0]} onClick={(event) => { event.stopPropagation(); onTalk() }}>
      <group ref={groupRef}>
        <mesh><coneGeometry args={[0.42, 1.12, 7]} /><meshStandardMaterial color="#1b1416" roughness={1} /></mesh>
        <mesh position={[0, 0.54, -0.03]}><sphereGeometry args={[0.17, 10, 8]} /><meshStandardMaterial color="#755b40" roughness={0.95} /></mesh>
        <mesh position={[0, 0.7, -0.08]}><coneGeometry args={[0.29, 0.46, 7]} /><meshStandardMaterial color="#09080a" /></mesh>
        {questMarker ? <QuestMarker state={questMarker} /> : null}
      </group>
    </group>
  )
}

function QuestMarker({ state }: { state: Exclude<QuestMarkerState, null> }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 96; canvas.height = 96
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = state === 'available' ? '#f1c84b' : state === 'inquiry' ? '#62b7ff' : '#d8dce4'
      context.font = '900 82px Georgia'; context.textAlign = 'center'; context.textBaseline = 'middle'
      context.fillText(state === 'available' ? '!' : '?', 48, 46)
    }
    return new THREE.CanvasTexture(canvas)
  }, [state])
  useEffect(() => () => texture.dispose(), [texture])
  return <sprite position={[0, 1.3, 0]} scale={[0.4, 0.4, 1]}><spriteMaterial map={texture} transparent depthTest={false} /></sprite>
}

function SleepingCloset() {
  return (
    <group position={[-0.75, 0, 0]}>
      <mesh position={[0, 0.27, 0]}><boxGeometry args={[1.55, 0.42, 0.86]} /><meshStandardMaterial color="#4b3325" /></mesh>
      <mesh position={[-0.55, 0.52, 0]}><boxGeometry args={[0.38, 0.12, 0.7]} /><meshStandardMaterial color="#a48c68" /></mesh>
      <mesh position={[0.15, 0.5, 0]}><boxGeometry args={[1.0, 0.12, 0.72]} /><meshStandardMaterial color="#665a4b" /></mesh>
    </group>
  )
}

function Latrine() {
  return (
    <group position={[-0.72, 0, 0]}>
      <mesh position={[0, 0.32, 0]}><cylinderGeometry args={[0.42, 0.33, 0.56, 12]} /><meshStandardMaterial color="#8d8b7b" roughness={0.85} /></mesh>
      <mesh position={[0, 0.64, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.34, 0.07, 8, 16]} /><meshStandardMaterial color="#b3b09c" /></mesh>
      <mesh position={[-0.75, 1.5, -1.32]}><planeGeometry args={[0.72, 1.05]} /><meshStandardMaterial color="#75807e" metalness={0.7} roughness={0.2} /></mesh>
    </group>
  )
}

function Mirror({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  return <mesh position={position} rotation={[0, rotationY, 0]}><planeGeometry args={[0.7, 1.15]} /><meshStandardMaterial color="#87908d" metalness={0.72} roughness={0.18} /></mesh>
}

function WarmLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, ROOM_HEIGHT - 0.045, 0]}>
        <cylinderGeometry args={[0.16, 0.12, 0.09, 12]} />
        <meshStandardMaterial color="#51351f" metalness={0.28} roughness={0.74} />
      </mesh>
      <mesh position={[0, 2.69, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.68, 8]} />
        <meshStandardMaterial color="#2e2118" metalness={0.38} roughness={0.68} />
      </mesh>
      <mesh position={[0, 2.32, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.27, 0.24, 12, 1, true]} />
        <meshStandardMaterial color="#76502c" metalness={0.18} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 2.2, 0]}>
        <sphereGeometry args={[0.14, 12, 8]} />
        <meshStandardMaterial color="#ffd98b" emissive="#ff8a22" emissiveIntensity={2.4} />
      </mesh>
      <pointLight color="#ffc166" intensity={11} distance={6} decay={1.8} position={[0, 2.15, 0]} />
    </group>
  )
}

function DustMotes({ zone }: { zone: string }) {
  const positions = useMemo(() => {
    const values = new Float32Array(72 * 3)
    for (let index = 0; index < 72; index += 1) {
      const seed = index + zone.length * 19
      values[index * 3] = seeded(seed * 12.9) * 9 - 4.5
      values[index * 3 + 1] = seeded(seed * 78.2) * ROOM_HEIGHT
      values[index * 3 + 2] = seeded(seed * 37.7) * 9 - 4.5
    }
    return values
  }, [zone])
  return <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><pointsMaterial color="#d8c38d" size={0.025} transparent opacity={0.45} /></points>
}

function makeGalleryShape(): THREE.Shape {
  const shape = new THREE.Shape()
  const vertices = [
    [-GALLERY_RADIUS / 2, -GALLERY_APOTHEM],
    [GALLERY_RADIUS / 2, -GALLERY_APOTHEM],
    [GALLERY_RADIUS, 0],
    [GALLERY_RADIUS / 2, GALLERY_APOTHEM],
    [-GALLERY_RADIUS / 2, GALLERY_APOTHEM],
    [-GALLERY_RADIUS, 0],
  ] as const
  shape.moveTo(vertices[0][0], vertices[0][1])
  vertices.slice(1).forEach(([x, y]) => shape.lineTo(x, y))
  shape.closePath()
  const hole = new THREE.Path()
  hole.absarc(0, 0, LIGHTWELL_RADIUS, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  return shape
}

function addressFromInstance(
  floor: BookAddress['floor'],
  gallery: BookAddress['gallery'],
  wall: ShelfWall,
  instance: number,
): BookAddress {
  return nearbyBookAddress(floor, gallery, wall, Math.floor(instance / BOOKS_PER_SHELF), instance % BOOKS_PER_SHELF)
}

function vestibuleHelp(floor: number): string {
  if (floor === 0) return 'west: sleeping closet / latrine · east stair: north lane up / south lane down'
  return 'west: sleeping closet / latrine · east: spiral stair to floor 0'
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, input, textarea, select, a, [data-touch-control="true"]'))
}

function clampAxis(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3
}

function smoothStep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value))
  return clamped * clamped * (3 - 2 * clamped)
}

function isPrimaryPointer(event: ReactPointerEvent<HTMLDivElement>): boolean {
  const pointerType = event.pointerType as string | undefined
  return event.button === 0 || pointerType !== 'mouse'
}

function eventPointerType(event: ThreeEvent<PointerEvent | MouseEvent>): string | undefined {
  return 'pointerType' in event.nativeEvent ? event.nativeEvent.pointerType : undefined
}

function seeded(seed: number): number {
  return Math.abs(Math.sin(seed) * 43758.5453) % 1
}

function useWebGLAvailable() {
  const [available] = useState(() => {
    try {
      const canvas = document.createElement('canvas')
      return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
    } catch {
      return false
    }
  })
  return available
}
