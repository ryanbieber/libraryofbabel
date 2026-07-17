import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { FIRST_PERSON_CAMERA_ORDER, cameraYawFromPlayerYaw } from './lib/camera'
import { incidentForGallery, type GalleryIncident } from './lib/incidents'
import { signedLabel, zoneLabel, type ConnectorCoordinate } from './lib/level'
import {
  BOOKS_PER_SHELF,
  BOOK_DIMENSIONS,
  SHELF_WALLS,
  SHELVES_PER_WALL,
  addressKey,
  coverInscription,
  nearbyBookAddress,
  rowDisplayLabel,
  wallDisplayLabel,
  type BookAddress,
  type ShelfWall,
} from './lib/library'
import type { LibraryNpc } from './lib/npcs'
import { shouldBookCapturePointer } from './lib/pointer'
import { visibleScenesForPose } from './lib/sceneVisibility'
import {
  BOOK_SCALE_LABELS,
  GALLERY_BULB_POSITIONS,
  SHELF_LABEL_ROTATION,
  VESTIBULE_MIRROR_POSITION,
  bookScaleLabelFraction,
} from './lib/sceneDetails'
import {
  LIGHTWELL_RAILS_PER_SHELL,
  LIGHTWELL_SHELL_LEVELS,
  STAIR_FLIGHT_LEVELS,
  STAIR_POST_INTERVAL,
  STAIR_STEPS_PER_FLIGHT,
  continuationBudgetForScenes,
} from './lib/visualContinuation'
import {
  BOOK_INTERACTION_RADIUS,
  FLOOR_HEIGHT,
  GALLERY_APOTHEM,
  GALLERY_RADIUS,
  LIGHTWELL_RADIUS,
  PASSAGE_OPENING_WIDTH,
  PLAYER_EYE_HEIGHT,
  RAILING_HEIGHT,
  SERVICE_PORTAL_OFFSET,
  SERVICE_PORTAL_WIDTH,
  SERVICE_ROOM_HALF_DEPTH,
  SERVICE_ROOM_HALF_WIDTH,
  SHELF_WIDTH,
  STAIR_START_ANGLE,
  VESTIBULE_HALF_DEPTH,
  VESTIBULE_HALF_WIDTH,
  distanceToBook,
  serviceRoomPortalZ,
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
const LEATHER_COLOR = '#302019'
const SPINE_BAND_HEIGHT_RATIOS = [-0.31, 0.31] as const
const DISTANT_LIGHTWELL_RADIUS = LIGHTWELL_RADIUS - 0.13

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
  const continuationBudget = continuationBudgetForScenes(visibleScenesForPose(playerPose))
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
      data-continuation-instances={continuationBudget.instances}
      data-continuation-draw-calls={continuationBudget.drawCalls}
      data-wandering-npcs={npcStates.filter(({ npc }) => npc.wandering).length}
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
      {playerPose.zone.kind === 'gallery' ? (
        <div className="shelf-address-guide" aria-label="Shelf address guide">
          <strong>Address guide</strong>
          <span>Walls I-IV = A-D</span>
          <span>Rows I-V · top to bottom</span>
          <span>Books 1-32 · left to right</span>
        </div>
      ) : null}
      {hoveredBook ? (
        <div className="book-address-chip" role="status">
          <span>Floor {signedLabel(hoveredBook.floor)} · Gallery {signedLabel(hoveredBook.gallery)}</span>
          <strong>Wall {wallDisplayLabel(hoveredBook.wall)} · Row {rowDisplayLabel(hoveredBook.shelf)} ({hoveredBook.shelf + 1}) · Book {hoveredBook.book + 1}</strong>
        </div>
      ) : null}
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
      <ambientLight intensity={0.32} color="#b8ad9a" />
      <hemisphereLight color="#c8b792" groundColor="#17120e" intensity={0.38} />
      <directionalLight color="#d6c5a1" intensity={0.3} position={[4, 7, 3]} />
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
          {scene.zone.kind === 'vestibule' ? <VestibuleScene connector={scene.zone.connector} reflectiveMirror={scene.isCurrent} /> : null}
          {scene.zone.kind === 'service' ? <ServiceRoomScene room={scene.zone.room} /> : null}
          {scene.zone.kind === 'stair' ? <StairScene /> : null}
        </group>
      ))}
      <DustMotes zone={playerPose.zone.kind} />
      <ScenePerformanceProbe />
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
  const incident = useMemo(() => incidentForGallery(floor, gallery), [floor, gallery])
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
        <cylinderGeometry args={[LIGHTWELL_RADIUS, LIGHTWELL_RADIUS, FLOOR_HEIGHT * 14, 24, 1, true]} />
        <meshStandardMaterial color="#050404" side={THREE.BackSide} />
      </mesh>
      <LightwellContinuation />
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
        npc.wandering
          ? <WanderingReader key={npc.id} npc={npc} onTalk={() => onTalkToNpc(npc)} />
          : <SeatedMonk key={npc.id} npc={npc} questMarker={questMarker} onTalk={() => onTalkToNpc(npc)} />
      ))}
      {incident ? <GalleryIncidentDetail incident={incident} /> : null}
      <GalleryBulbs />
    </>
  )
}

function GalleryIncidentDetail({ incident }: { incident: GalleryIncident }) {
  return (
    <group>
      {incident.kind === 'purifier-damage' ? <PurifierDamage /> : null}
      {incident.kind === 'contradictory-catalogs' ? <ContradictoryCatalogs variant={incident.variant} /> : null}
      {incident.kind === 'abandoned-belongings' ? <AbandonedBelongings /> : null}
      {incident.kind === 'shaft-omen' ? <ShaftOmen phase={incident.variant / 8} /> : null}
    </group>
  )
}

function PurifierDamage() {
  return (
    <group>
      {[[-2.92, 0.024, -0.74, 0.7], [-2.7, 0.026, -0.36, 0.38]] .map(([x, y, z, radius], index) => (
        <mesh key={index} position={[x, y, z]} rotation={[-Math.PI / 2, 0, index * 0.7]} scale={[1, 0.55, 1]} raycast={() => null}>
          <circleGeometry args={[radius, 18]} />
          <meshBasicMaterial color={index === 0 ? '#160d09' : '#2b1710'} transparent opacity={0.72} depthWrite={false} />
        </mesh>
      ))}
      <group position={[-2.82, 0.08, -0.52]} rotation={[0.05, 0.3, -0.12]}>
        {[0, 0.18, 0.37].map((offset, index) => (
          <mesh key={offset} position={[offset, index * 0.018, index * 0.075]} rotation={[0, 0.2 * index, 0.08]} raycast={() => null}>
            <boxGeometry args={[0.43, 0.055, 0.3]} />
            <meshStandardMaterial color={index === 1 ? '#44271b' : '#241713'} roughness={1} />
          </mesh>
        ))}
        <mesh position={[0.19, 0.08, 0.04]} rotation={[Math.PI / 2, 0.2, 0]} raycast={() => null}>
          <torusGeometry args={[0.18, 0.027, 6, 12, Math.PI * 1.55]} />
          <meshStandardMaterial color="#755331" roughness={1} />
        </mesh>
      </group>
      <mesh position={[-3.96, 1.2, -0.05]} rotation={[0, Math.PI / 2, 0]} scale={[1.5, 1, 1]} raycast={() => null}>
        <circleGeometry args={[0.42, 20]} />
        <meshBasicMaterial color="#1a0f0b" transparent opacity={0.68} depthWrite={false} />
      </mesh>
    </group>
  )
}

function ContradictoryCatalogs({ variant }: { variant: number }) {
  const labels = variant % 2 === 0
    ? ['CRIMSON HEXAGON  ·  NORTH', 'CRIMSON HEXAGON  ·  SOUTH']
    : ['TRUE CATALOG  ·  FLOOR +1', 'TRUE CATALOG  ·  FLOOR -1']
  const textures = useMemo(() => (
    (variant % 2 === 0
      ? ['CRIMSON HEXAGON  ·  NORTH', 'CRIMSON HEXAGON  ·  SOUTH']
      : ['TRUE CATALOG  ·  FLOOR +1', 'TRUE CATALOG  ·  FLOOR -1'])
      .map((label) => createPlaqueTexture(label, 900, 150))
  ), [variant])
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures])

  return (
    <group position={[2.52, 1.12, 0]} rotation={[0, -Math.PI / 2, 0]}>
      {textures.map((texture, index) => (
        <sprite
          key={labels[index]}
          position={[index ? 0.64 : -0.64, index ? -0.18 : 0.18, index ? 0.035 : 0]}
          rotation={[0, 0, index ? -0.04 : 0.055]}
          scale={[1.22, 0.25, 1]}
          raycast={() => null}
        >
          <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
    </group>
  )
}

function AbandonedBelongings() {
  return (
    <group position={[2.75, 0, 0.84]} rotation={[0, -0.42, 0]}>
      <mesh position={[0, 0.18, 0]} scale={[1.05, 0.82, 0.78]} raycast={() => null}>
        <sphereGeometry args={[0.32, 10, 7]} />
        <meshStandardMaterial color="#443226" roughness={1} />
      </mesh>
      <mesh position={[0, 0.32, -0.02]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[0.31, 0.035, 7, 16, Math.PI]} />
        <meshStandardMaterial color="#5b402c" roughness={1} />
      </mesh>
      {[-0.43, -0.24, 0.38].map((x, index) => (
        <mesh key={x} position={[x, 0.025 + index * 0.006, 0.2 - index * 0.13]} rotation={[-Math.PI / 2, 0, 0.2 - index * 0.32]} raycast={() => null}>
          <planeGeometry args={[0.38, 0.52]} />
          <meshStandardMaterial color={index === 2 ? '#a89870' : '#c1b58e'} roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <group position={[0.45, 0.12, -0.18]} rotation={[0, 0, 0.16]}>
        <mesh raycast={() => null}>
          <cylinderGeometry args={[0.1, 0.085, 0.24, 10]} />
          <meshStandardMaterial color="#78664b" roughness={0.92} />
        </mesh>
        <mesh position={[0.105, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <torusGeometry args={[0.075, 0.018, 6, 10]} />
          <meshStandardMaterial color="#78664b" roughness={0.92} />
        </mesh>
      </group>
    </group>
  )
}

function ShaftOmen({ phase }: { phase: number }) {
  const bookRef = useRef<THREE.Group>(null)
  const shadowRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const progress = (clock.elapsedTime * 0.045 + phase) % 1
    const book = bookRef.current
    const shadow = shadowRef.current
    if (book) {
      const angle = progress * Math.PI * 3
      book.position.set(Math.cos(angle) * 0.54, 5.8 - progress * 11.6, Math.sin(angle) * 0.54)
      book.rotation.set(progress * Math.PI * 7, progress * Math.PI * 4, progress * Math.PI * 2)
      book.visible = progress > 0.08 && progress < 0.91
    }
    if (shadow) {
      shadow.position.y = 2.2 - progress * 1.1
      ;(shadow.material as THREE.MeshBasicMaterial).opacity = Math.sin(progress * Math.PI) * 0.2
    }
  })
  return (
    <group>
      <group ref={bookRef}>
        <mesh raycast={() => null}>
          <boxGeometry args={[0.22, 0.32, 0.06]} />
          <meshStandardMaterial color="#241813" roughness={0.96} />
        </mesh>
        <mesh position={[0.105, 0, 0]} raycast={() => null}>
          <boxGeometry args={[0.02, 0.3, 0.065]} />
          <meshStandardMaterial color="#806541" roughness={0.9} />
        </mesh>
      </group>
      <mesh ref={shadowRef} position={[0.78, 1.6, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[0.34, 1, 1]} raycast={() => null}>
        <circleGeometry args={[0.48, 16]} />
        <meshBasicMaterial color="#050404" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

function LightwellContinuation() {
  const ringsRef = useRef<THREE.InstancedMesh>(null)
  const railsRef = useRef<THREE.InstancedMesh>(null)
  const lampsRef = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const rings = ringsRef.current
    const rails = railsRef.current
    const lamps = lampsRef.current
    if (!rings || !rails || !lamps) return
    const dummy = new THREE.Object3D()
    let railInstance = 0

    LIGHTWELL_SHELL_LEVELS.forEach((level, shellIndex) => {
      const y = level * FLOOR_HEIGHT
      dummy.position.set(0, y, 0)
      dummy.rotation.set(Math.PI / 2, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      rings.setMatrixAt(shellIndex, dummy.matrix)

      for (let rail = 0; rail < LIGHTWELL_RAILS_PER_SHELL; rail += 1) {
        const angle = rail / LIGHTWELL_RAILS_PER_SHELL * Math.PI * 2
        dummy.position.set(
          Math.cos(angle) * DISTANT_LIGHTWELL_RADIUS,
          y + RAILING_HEIGHT / 2,
          Math.sin(angle) * DISTANT_LIGHTWELL_RADIUS,
        )
        dummy.rotation.set(0, -angle, 0)
        dummy.updateMatrix()
        rails.setMatrixAt(railInstance, dummy.matrix)
        railInstance += 1
      }

      const lampAngle = level * 1.71
      dummy.position.set(Math.cos(lampAngle) * 0.9, y + 0.18, Math.sin(lampAngle) * 0.9)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      lamps.setMatrixAt(shellIndex, dummy.matrix)
    })

    rings.instanceMatrix.needsUpdate = true
    rails.instanceMatrix.needsUpdate = true
    lamps.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <group>
      <instancedMesh ref={ringsRef} args={[undefined, undefined, LIGHTWELL_SHELL_LEVELS.length]} raycast={() => null}>
        <torusGeometry args={[DISTANT_LIGHTWELL_RADIUS, 0.08, 5, 24]} />
        <meshStandardMaterial color="#574a3c" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={railsRef} args={[undefined, undefined, LIGHTWELL_SHELL_LEVELS.length * LIGHTWELL_RAILS_PER_SHELL]} raycast={() => null}>
        <boxGeometry args={[0.045, RAILING_HEIGHT, 0.045]} />
        <meshStandardMaterial color="#72572e" metalness={0.25} roughness={0.78} />
      </instancedMesh>
      <instancedMesh ref={lampsRef} args={[undefined, undefined, LIGHTWELL_SHELL_LEVELS.length]} raycast={() => null}>
        <sphereGeometry args={[0.08, 7, 5]} />
        <meshStandardMaterial color="#9c6d31" emissive="#e0a14b" emissiveIntensity={0.85} roughness={0.8} />
      </instancedMesh>
    </group>
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
        <meshStandardMaterial color="#4a2c1c" emissive="#160b06" emissiveIntensity={0.34} roughness={1} />
      </mesh>
      {Array.from({ length: SHELVES_PER_WALL + 1 }, (_, shelf) => (
        <mesh key={shelf} position={[0, 1.18 - shelf * 0.49, -0.24]}>
          <boxGeometry args={[SHELF_WIDTH + 0.28, 0.08, 0.36]} />
          <meshStandardMaterial color="#765033" emissive="#241207" emissiveIntensity={0.42} roughness={0.94} />
        </mesh>
      ))}
      {interactive ? <ShelfWayfinding gallery={gallery} wall={wall} /> : null}
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
      <SpineInscriptions floor={floor} gallery={gallery} wall={wall} />
    </group>
  )
}

function SpineInscriptions({ floor, gallery, wall }: {
  floor: BookAddress['floor']
  gallery: BookAddress['gallery']
  wall: ShelfWall
}) {
  const texture = useMemo(() => createSpineInscriptionTexture(floor, gallery, wall), [floor, gallery, wall])
  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh position={[0, 0.05, -0.382]} raycast={() => null}>
      <planeGeometry args={[SHELF_WIDTH, 2.45]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function GalleryBulbs() {
  return (
    <>
      {GALLERY_BULB_POSITIONS.map((position) => (
        <group key={position[0]} position={position}>
          <mesh>
            <sphereGeometry args={[0.14, 12, 9]} />
            <meshStandardMaterial color="#f0d49a" emissive="#d47a22" emissiveIntensity={2.05} roughness={0.42} />
          </mesh>
          <pointLight color="#e8ad5e" intensity={8.5} distance={5.2} decay={2} />
        </group>
      ))}
    </>
  )
}

function ShelfWayfinding({ gallery, wall }: { gallery: BookAddress['gallery']; wall: ShelfWall }) {
  const wallTexture = useMemo(
    () => createPlaqueTexture(`GALLERY ${signedLabel(gallery)}  ·  WALL ${wallDisplayLabel(wall)}`, 1024, 144),
    [gallery, wall],
  )
  const rowTextures = useMemo(
    () => Array.from({ length: SHELVES_PER_WALL }, (_, shelf) => createPlaqueTexture(rowDisplayLabel(shelf), 160, 128)),
    [],
  )
  const bookScaleTexture = useMemo(() => createBookScaleTexture(), [])

  useEffect(() => () => {
    wallTexture.dispose()
    rowTextures.forEach((texture) => texture.dispose())
    bookScaleTexture.dispose()
  }, [bookScaleTexture, rowTextures, wallTexture])

  return (
    <group>
      <mesh position={[0, 1.34, -0.39]} rotation={SHELF_LABEL_ROTATION} raycast={() => null}>
        <planeGeometry args={[3.15, 0.42]} />
        <meshBasicMaterial map={wallTexture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {Array.from({ length: SHELVES_PER_WALL }, (_, shelf) => (
        <group key={shelf}>
          <mesh position={[-SHELF_WIDTH / 2 - 0.2, 1.03 - shelf * 0.49, -0.4]} rotation={SHELF_LABEL_ROTATION} raycast={() => null}>
            <planeGeometry args={[0.25, 0.19]} />
            <meshBasicMaterial map={rowTextures[shelf]} transparent depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.74 - shelf * 0.49, -0.43]} rotation={SHELF_LABEL_ROTATION} raycast={() => null}>
            <planeGeometry args={[SHELF_WIDTH - 0.16, 0.105]} />
            <meshBasicMaterial map={bookScaleTexture} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function createPlaqueTexture(text: string, width: number, height: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = 'rgba(30, 18, 11, 0.94)'
    context.fillRect(0, 0, width, height)
    context.strokeStyle = '#c89a4a'
    context.lineWidth = Math.max(5, height * 0.06)
    context.strokeRect(context.lineWidth / 2, context.lineWidth / 2, width - context.lineWidth, height - context.lineWidth)
    context.fillStyle = '#ffe6a1'
    const maximumFontSize = Math.round(height * 0.46)
    let fontSize = maximumFontSize
    context.font = `700 ${fontSize}px Georgia`
    const availableWidth = width - height * 0.3
    while (fontSize > 12 && context.measureText(text).width > availableWidth) {
      fontSize -= 2
      context.font = `700 ${fontSize}px Georgia`
    }
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, width / 2, height * 0.53)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createBookScaleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = 'rgba(42, 24, 13, 0.92)'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#f4cc78'
    context.font = '700 35px Georgia'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    BOOK_SCALE_LABELS.forEach((book) => {
      context.fillText(String(book), bookScaleLabelFraction(book) * canvas.width, canvas.height * 0.54)
    })
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createSpineInscriptionTexture(
  floor: BookAddress['floor'],
  gallery: BookAddress['gallery'],
  wall: ShelfWall,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 1024
  const context = canvas.getContext('2d')
  if (context) {
    const planeTop = 1.275
    context.fillStyle = 'rgba(211, 171, 99, 0.72)'
    context.font = '600 19px Georgia'
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    for (let shelf = 0; shelf < SHELVES_PER_WALL; shelf += 1) {
      const baseY = 1.03 - shelf * 0.49
      const centerY = (planeTop - baseY) / 2.45 * canvas.height
      for (let book = 0; book < BOOKS_PER_SHELF; book += 1) {
        const address = nearbyBookAddress(floor, gallery, wall, shelf, book)
        const inscription = coverInscription(address)
        const centerX = (book + 0.5) / BOOKS_PER_SHELF * canvas.width
        ;[...inscription].forEach((symbol, index) => {
          context.fillText(symbol, centerX, centerY + (index - (inscription.length - 1) / 2) * 18)
        })
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
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
    const { width, height, depth } = BOOK_DIMENSIONS
    const baseX = -SHELF_WIDTH / 2 + (book + 0.5) * cellWidth
    const baseY = 1.03 - shelf * 0.49
    const pullProgress = easeOutCubic(Math.min(1, presentation / 0.72))
    const turnProgress = smoothStep(Math.max(0, (presentation - 0.28) / 0.72))
    const angle = BOOK_PRESENTATION_ANGLE * turnProgress
    const z = -0.31 - BOOK_PULL_DISTANCE * pullProgress

    dummy.position.set(baseX, baseY, z)
    dummy.rotation.set(0, angle, 0)
    dummy.scale.set(width, height, depth)
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
  }, [dummy, toolingDummy])

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
      const color = new THREE.Color(LEATHER_COLOR)
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
        <meshStandardMaterial emissive="#24120b" emissiveIntensity={0.56} roughness={0.84} metalness={0.03} />
      </instancedMesh>
      <instancedMesh ref={toolingRef} args={[undefined, undefined, count * 2]} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#c69a4b" emissive="#4a2808" emissiveIntensity={0.48} roughness={0.38} metalness={0.58} />
      </instancedMesh>
    </>
  )
}

function VestibuleScene({ connector: _connector, reflectiveMirror }: { connector: ConnectorCoordinate; reflectiveMirror: boolean }) {
  return (
    <>
      <BoxRoom width={VESTIBULE_HALF_WIDTH * 2} depth={VESTIBULE_HALF_DEPTH * 2} color="#4a443b" openNorth openSouth openWest openEast />
      <CorridorEnd z={-VESTIBULE_HALF_DEPTH} />
      <CorridorEnd z={VESTIBULE_HALF_DEPTH} rotationY={Math.PI} />
      <SidePortal side="west" z={-SERVICE_PORTAL_OFFSET} labelColor="#897151" width={SERVICE_PORTAL_WIDTH} />
      <SidePortal side="west" z={SERVICE_PORTAL_OFFSET} labelColor="#6d5944" width={SERVICE_PORTAL_WIDTH} />
      <SidePortal side="east" z={0} labelColor="#a67d36" wide />
      <MonasticVestibuleDetails />
      <ProvisionNook />
      <VestibuleMirror reflective={reflectiveMirror} />
      <WarmLamp position={[0, 0, 0]} />
    </>
  )
}

function ServiceRoomScene({ room }: { room: 'sleeping' | 'latrine' }) {
  return (
    <>
      <BoxRoom width={SERVICE_ROOM_HALF_WIDTH * 2} depth={SERVICE_ROOM_HALF_DEPTH * 2} color={room === 'sleeping' ? '#453c32' : '#4a4b43'} openEast />
      <SidePortal
        side="east"
        z={serviceRoomPortalZ(room)}
        labelColor={room === 'sleeping' ? '#836b48' : '#6f766b'}
        wallX={SERVICE_ROOM_HALF_WIDTH}
        width={SERVICE_PORTAL_WIDTH}
      />
      <ServiceRoomFloor room={room} />
      {room === 'sleeping' ? <SleepingCloset /> : <Latrine />}
      <WarmLamp position={[-0.75, 0, room === 'sleeping' ? 0.75 : -0.78]} />
    </>
  )
}

function StairScene() {
  const shaftHeight = FLOOR_HEIGHT * 12
  return (
    <>
      <mesh position={[0, FLOOR_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[2.55, 2.55, shaftHeight, 32, 1, true]} />
        <meshStandardMaterial color="#292522" roughness={1} side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, FLOOR_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.43, 0.43, shaftHeight, 12, 1, true]} />
        <meshStandardMaterial color="#171311" roughness={0.96} />
      </mesh>
      <SpiralFlights />
      {[-1.5, -0.5, 0.5, 1.5, 2.5].map((level) => (
        <pointLight key={level} color="#ffc05c" intensity={13} distance={6.5} decay={2} position={[0, level * FLOOR_HEIGHT, 0]} />
      ))}
    </>
  )
}

function SpiralFlights() {
  const stepsRef = useRef<THREE.InstancedMesh>(null)
  const postsRef = useRef<THREE.InstancedMesh>(null)
  const lampsRef = useRef<THREE.InstancedMesh>(null)
  const grillesRef = useRef<THREE.InstancedMesh>(null)
  const handrails = useMemo(() => STAIR_FLIGHT_LEVELS.map((level) => new THREE.CatmullRomCurve3(
    Array.from({ length: 49 }, (_, index) => {
      const trackFraction = index / 48
      const angle = STAIR_START_ANGLE + trackFraction * Math.PI * 2
      return new THREE.Vector3(
        Math.cos(angle) * 2.05,
        level * FLOOR_HEIGHT + trackFraction * FLOOR_HEIGHT + RAILING_HEIGHT,
        Math.sin(angle) * 2.05,
      )
    }),
  )), [])

  useLayoutEffect(() => {
    const steps = stepsRef.current
    const posts = postsRef.current
    const lamps = lampsRef.current
    const grilles = grillesRef.current
    if (!steps || !posts || !lamps || !grilles) return
    const dummy = new THREE.Object3D()
    let stepInstance = 0
    let postInstance = 0

    STAIR_FLIGHT_LEVELS.forEach((level, flightIndex) => {
      for (let index = 0; index < STAIR_STEPS_PER_FLIGHT; index += 1) {
        const trackFraction = index / (STAIR_STEPS_PER_FLIGHT - 1)
        const angle = STAIR_START_ANGLE + trackFraction * Math.PI * 2
        const y = level * FLOOR_HEIGHT + trackFraction * FLOOR_HEIGHT
        dummy.position.set(Math.cos(angle) * 1.38, y, Math.sin(angle) * 1.38)
        dummy.rotation.set(0, -angle, 0)
        dummy.updateMatrix()
        steps.setMatrixAt(stepInstance, dummy.matrix)
        stepInstance += 1

        if (index % STAIR_POST_INTERVAL === 0) {
          dummy.position.set(Math.cos(angle) * 2.05, y + RAILING_HEIGHT / 2, Math.sin(angle) * 2.05)
          dummy.rotation.set(0, -angle, 0)
          dummy.updateMatrix()
          posts.setMatrixAt(postInstance, dummy.matrix)
          postInstance += 1
        }
      }

      const lampAngle = STAIR_START_ANGLE + (flightIndex % 2 ? Math.PI * 0.7 : Math.PI * 1.35)
      dummy.position.set(Math.cos(lampAngle) * 2.34, (level + 0.52) * FLOOR_HEIGHT, Math.sin(lampAngle) * 2.34)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      lamps.setMatrixAt(flightIndex, dummy.matrix)
    })

    let grilleInstance = 0
    ;[-1, 2].forEach((level) => {
      for (let bar = 0; bar < 5; bar += 1) {
        dummy.position.set(-2.43, level * FLOOR_HEIGHT + 1.08, -0.62 + bar * 0.31)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        grilles.setMatrixAt(grilleInstance, dummy.matrix)
        grilleInstance += 1
      }
    })

    steps.instanceMatrix.needsUpdate = true
    posts.instanceMatrix.needsUpdate = true
    lamps.instanceMatrix.needsUpdate = true
    grilles.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <>
      <instancedMesh ref={stepsRef} args={[undefined, undefined, STAIR_FLIGHT_LEVELS.length * STAIR_STEPS_PER_FLIGHT]} raycast={() => null}>
        <boxGeometry args={[1.45, 0.09, 0.42]} />
        <meshStandardMaterial color="#5f544a" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={postsRef} args={[undefined, undefined, STAIR_FLIGHT_LEVELS.length * STAIR_STEPS_PER_FLIGHT / STAIR_POST_INTERVAL]} raycast={() => null}>
        <boxGeometry args={[0.05, RAILING_HEIGHT, 0.05]} />
        <meshStandardMaterial color="#9b7538" metalness={0.42} roughness={0.62} />
      </instancedMesh>
      {handrails.map((handrail, index) => (
        <mesh key={STAIR_FLIGHT_LEVELS[index]} raycast={() => null}>
          <tubeGeometry args={[handrail, 48, 0.04, 5, false]} />
          <meshStandardMaterial color="#85642f" metalness={0.32} roughness={0.72} />
        </mesh>
      ))}
      <instancedMesh ref={lampsRef} args={[undefined, undefined, STAIR_FLIGHT_LEVELS.length]} raycast={() => null}>
        <sphereGeometry args={[0.09, 7, 5]} />
        <meshStandardMaterial color="#d79b45" emissive="#f2ad4b" emissiveIntensity={1.2} />
      </instancedMesh>
      <instancedMesh ref={grillesRef} args={[undefined, undefined, 10]} raycast={() => null}>
        <boxGeometry args={[0.06, 2.16, 0.06]} />
        <meshStandardMaterial color="#5d4a31" metalness={0.45} roughness={0.72} />
      </instancedMesh>
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

function ScenePerformanceProbe() {
  const elapsedRef = useRef(0)
  useFrame(({ gl, scene }, delta) => {
    elapsedRef.current += delta
    if (elapsedRef.current < 1) return
    elapsedRef.current = 0
    const viewport = document.querySelector<HTMLElement>('[data-testid="arena-viewport"]')
    if (!viewport) return
    let objects = 0
    scene.traverse(() => { objects += 1 })
    viewport.dataset.sceneObjects = String(objects)
    viewport.dataset.renderCalls = String(gl.info.render.calls)
    viewport.dataset.rendererGeometries = String(gl.info.memory.geometries)
    viewport.dataset.rendererTextures = String(gl.info.memory.textures)
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
  const openingWidth = PASSAGE_OPENING_WIDTH
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

function CorridorEnd({ z, rotationY = 0 }: { z: number; rotationY?: number }) {
  return (
    <group position={[0, 0, z]} rotation={[0, rotationY, 0]}>
      <PassageFrame z={0} totalWidth={VESTIBULE_HALF_WIDTH * 2} />
    </group>
  )
}

function SidePortal({ side, z, labelColor, wallX = VESTIBULE_HALF_WIDTH, wide = false, width }: { side: 'east' | 'west'; z: number; labelColor: string; wallX?: number; wide?: boolean; width?: number }) {
  const x = side === 'east' ? wallX : -wallX
  const openingWidth = width ?? (wide ? SERVICE_PORTAL_WIDTH : 1.05)
  return (
    <group position={[x, 0, z]} rotation={[0, side === 'east' ? -Math.PI / 2 : Math.PI / 2, 0]}>
      {[-1, 1].map((direction) => (
        <mesh key={direction} position={[direction * openingWidth / 2, 1.1, 0]}>
          <boxGeometry args={[0.13, 2.2, 0.22]} />
          <meshStandardMaterial color="#716454" roughness={0.96} />
        </mesh>
      ))}
      <mesh position={[0, 2.18, 0]}>
        <boxGeometry args={[openingWidth + 0.18, 0.16, 0.24]} />
        <meshStandardMaterial color="#716454" roughness={0.96} />
      </mesh>
      <mesh position={[0, 2.5, -0.02]}><boxGeometry args={[openingWidth, 0.22, 0.18]} /><meshStandardMaterial color={labelColor} roughness={0.8} /></mesh>
    </group>
  )
}

function MonasticVestibuleDetails() {
  return (
    <>
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.15, 3.08]} />
        <meshStandardMaterial color="#625443" roughness={1} />
      </mesh>
      {[-1.06, 1.06].map((x) => (
        <mesh key={x} position={[x, 0.026, 0]}>
          <boxGeometry args={[0.045, 0.035, 3.08]} />
          <meshStandardMaterial color="#a18b67" roughness={0.9} />
        </mesh>
      ))}
      {[-1.42, 0, 1.42].map((x) => (
        <mesh key={x} position={[x, ROOM_HEIGHT - 0.1, 0]}>
          <boxGeometry args={[0.1, 0.14, VESTIBULE_HALF_DEPTH * 2]} />
          <meshStandardMaterial color="#514638" roughness={0.94} />
        </mesh>
      ))}
      <mesh position={[0, ROOM_HEIGHT - 0.08, 0]}>
        <boxGeometry args={[VESTIBULE_HALF_WIDTH * 2, 0.12, 0.1]} />
        <meshStandardMaterial color="#514638" roughness={0.94} />
      </mesh>
      <pointLight color="#e8c581" intensity={4.5} distance={4.5} decay={2} position={[0, 1.8, 0]} />
    </>
  )
}

function ProvisionNook() {
  return (
    <group position={[1.92, 0, -1.06]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 0.46, 0]}><boxGeometry args={[0.82, 0.1, 0.42]} /><meshStandardMaterial color="#59422d" roughness={0.95} /></mesh>
      {[-0.32, 0.32].map((x) => (
        <mesh key={x} position={[x, 0.23, 0]}><boxGeometry args={[0.09, 0.46, 0.34]} /><meshStandardMaterial color="#3c2c20" roughness={1} /></mesh>
      ))}
      <mesh position={[0, 1.28, 0.15]}><boxGeometry args={[0.88, 1.46, 0.12]} /><meshStandardMaterial color="#413124" roughness={1} /></mesh>
      {[0.82, 1.28, 1.72].map((y) => (
        <mesh key={y} position={[0, y, -0.02]}><boxGeometry args={[0.84, 0.08, 0.42]} /><meshStandardMaterial color="#664b31" roughness={0.96} /></mesh>
      ))}
      <BreadLoaf position={[-0.18, 0.57, -0.02]} scale={0.95} />
      <BreadLoaf position={[0.16, 0.56, 0]} scale={0.78} />
      <mesh position={[-0.2, 0.94, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.14, 16]} />
        <meshStandardMaterial color="#c99b45" roughness={0.88} />
      </mesh>
      {[-0.05, 0.23].map((x, index) => <ClayVessel key={x} position={[x, 1.05, -0.04]} scale={index ? 0.82 : 1} />)}
      {[-0.2, 0, 0.2].map((x, index) => (
        <mesh key={x} position={[x, 1.82 + index * 0.015, -0.05]}>
          <sphereGeometry args={[0.085, 10, 7]} />
          <meshStandardMaterial color={index === 1 ? '#8d6e2e' : '#6f7b3a'} roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 2.18, 0.14]}><boxGeometry args={[0.68, 0.22, 0.08]} /><meshStandardMaterial color="#8f774e" roughness={0.9} /></mesh>
    </group>
  )
}

function BreadLoaf({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <mesh position={position} scale={[scale, scale * 0.7, scale * 0.72]}>
      <sphereGeometry args={[0.22, 12, 8]} />
      <meshStandardMaterial color="#b98748" roughness={0.94} />
    </mesh>
  )
}

function ClayVessel({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh><cylinderGeometry args={[0.1, 0.14, 0.3, 12]} /><meshStandardMaterial color="#8a5a3b" roughness={1} /></mesh>
      <mesh position={[0, 0.17, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.075, 0.018, 6, 12]} /><meshStandardMaterial color="#a36d49" roughness={1} /></mesh>
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
        {npc.quest === 'significant-word' ? (
          <GreyQuestKeeper questMarker={questMarker} />
        ) : npc.quest === 'word-finder' ? (
          <MonasticIndexer questMarker={questMarker} />
        ) : (
          <HoodedMonk questMarker={questMarker} />
        )}
      </group>
    </group>
  )
}

const WANDERING_READER_PALETTES = [
  { coat: '#40505b', trim: '#778895', skin: '#a87859', hair: '#33251f', book: '#7d3528' },
  { coat: '#5b463c', trim: '#9b8062', skin: '#bd8b68', hair: '#473126', book: '#31506a' },
  { coat: '#3e503f', trim: '#849276', skin: '#8e624c', hair: '#231d1b', book: '#704c25' },
  { coat: '#51445c', trim: '#8e7a96', skin: '#c18d65', hair: '#5a4030', book: '#314c3a' },
  { coat: '#5c3e42', trim: '#9d7776', skin: '#9b6d52', hair: '#2d2524', book: '#5b3f72' },
  { coat: '#4c4b43', trim: '#908c77', skin: '#b77d59', hair: '#3b2920', book: '#7a652d' },
] as const

function WanderingReader({ npc, onTalk }: { npc: LibraryNpc; onTalk: () => void }) {
  const groupRef = useRef<THREE.Group>(null)
  const bodyRef = useRef<THREE.Group>(null)
  const positionedNpcIdRef = useRef<string | null>(null)
  const wandering = npc.wandering!
  const palette = WANDERING_READER_PALETTES[wandering.appearance.palette % WANDERING_READER_PALETTES.length]

  useFrame(({ clock }, delta) => {
    const group = groupRef.current
    const body = bodyRef.current
    if (!group || !body) return
    if (positionedNpcIdRef.current !== npc.id) {
      group.position.set(npc.position.x, 0, npc.position.z)
      positionedNpcIdRef.current = npc.id
    }
    const dx = npc.position.x - group.position.x
    const dz = npc.position.z - group.position.z
    const distance = Math.hypot(dx, dz)
    if (distance > 0.001) {
      const smoothing = 1 - Math.exp(-delta * 7)
      group.position.x += dx * smoothing
      group.position.z += dz * smoothing
      const targetYaw = Math.atan2(-dx, -dz)
      const yawDelta = Math.atan2(Math.sin(targetYaw - group.rotation.y), Math.cos(targetYaw - group.rotation.y))
      group.rotation.y += yawDelta * Math.min(1, delta * 6)
    }
    const walking = wandering.activity === 'walking' || distance > 0.015
    body.position.y = walking ? Math.sin(clock.elapsedTime * 7 + wandering.phase) * 0.025 : 0
    body.rotation.z = wandering.activity === 'comparing-notes' ? -0.035 : 0
  })

  return (
    <group
      ref={groupRef}
      scale={wandering.appearance.stature}
      onClick={(event) => { event.stopPropagation(); onTalk() }}
    >
      <group ref={bodyRef}>
        <mesh position={[-0.14, 0.38, 0]} rotation={[0, 0, -0.025]}>
          <cylinderGeometry args={[0.085, 0.095, 0.72, 8]} />
          <meshStandardMaterial color={palette.coat} roughness={1} />
        </mesh>
        <mesh position={[0.14, 0.38, 0]} rotation={[0, 0, 0.025]}>
          <cylinderGeometry args={[0.085, 0.095, 0.72, 8]} />
          <meshStandardMaterial color={palette.coat} roughness={1} />
        </mesh>
        <mesh position={[0, 0.87, 0]} scale={[1, 1, 0.72]}>
          <coneGeometry args={[0.34, 0.82, 10]} />
          <meshStandardMaterial color={palette.coat} roughness={1} />
        </mesh>
        <mesh position={[0, 1.08, -0.08]} scale={[1, 0.72, 0.75]}>
          <torusGeometry args={[0.25, 0.035, 7, 14]} />
          <meshStandardMaterial color={palette.trim} roughness={0.96} />
        </mesh>
        <CylinderBetween start={[-0.22, 1.05, -0.02]} end={[-0.13, 0.88, -0.3]} radius={0.07} color={palette.coat} />
        <CylinderBetween start={[0.22, 1.05, -0.02]} end={[0.13, 0.88, -0.3]} radius={0.07} color={palette.coat} />
        <mesh position={[-0.13, 0.87, -0.31]}><sphereGeometry args={[0.07, 9, 7]} /><meshStandardMaterial color={palette.skin} roughness={0.95} /></mesh>
        <mesh position={[0.13, 0.87, -0.31]}><sphereGeometry args={[0.07, 9, 7]} /><meshStandardMaterial color={palette.skin} roughness={0.95} /></mesh>
        <mesh position={[0, 1.42, -0.02]}>
          <sphereGeometry args={[0.19, 13, 10]} />
          <meshStandardMaterial color={palette.skin} roughness={0.95} />
        </mesh>
        <mesh position={[0, 1.52, 0.01]} scale={[1.04, 0.72, 1]}>
          <sphereGeometry args={[0.195, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.65]} />
          <meshStandardMaterial color={palette.hair} roughness={1} />
        </mesh>
        <mesh position={[-0.067, 1.45, -0.177]} scale={[1, 0.65, 0.5]}>
          <sphereGeometry args={[0.018, 7, 5]} />
          <meshStandardMaterial color="#161411" roughness={0.85} />
        </mesh>
        <mesh position={[0.067, 1.45, -0.177]} scale={[1, 0.65, 0.5]}>
          <sphereGeometry args={[0.018, 7, 5]} />
          <meshStandardMaterial color="#161411" roughness={0.85} />
        </mesh>
        <CarriedReading accessory={wandering.appearance.accessory} color={palette.book} />
      </group>
    </group>
  )
}

function CarriedReading({ accessory, color }: {
  accessory: NonNullable<LibraryNpc['wandering']>['appearance']['accessory']
  color: string
}) {
  const count = accessory === 'book-stack' ? 3 : accessory === 'catalog-cards' ? 4 : 1
  const isPaper = accessory === 'notes' || accessory === 'catalog-cards'
  return (
    <group position={[0, 0.91, -0.34]} rotation={[isPaper ? -0.28 : -0.12, 0, 0]}>
      {Array.from({ length: count }, (_, index) => (
        <mesh key={index} position={[0, index * 0.045, index * 0.012]} rotation={[0, index * 0.05, index % 2 === 0 ? 0.025 : -0.025]}>
          <boxGeometry args={[isPaper ? 0.36 : 0.42, isPaper ? 0.018 : 0.055, isPaper ? 0.27 : 0.3]} />
          <meshStandardMaterial color={isPaper ? '#c7b887' : color} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

function GreyQuestKeeper({ questMarker }: { questMarker: QuestMarkerState }) {
  return (
    <>
      <mesh position={[0, -0.04, 0.02]}>
        <coneGeometry args={[0.44, 1.02, 12]} />
        <meshStandardMaterial color="#625f59" roughness={1} />
      </mesh>
      <mesh position={[0, 0.25, -0.01]} scale={[1, 0.8, 0.72]}>
        <sphereGeometry args={[0.31, 14, 10]} />
        <meshStandardMaterial color="#77736c" roughness={0.96} />
      </mesh>

      <CylinderBetween start={[-0.19, 0.31, -0.02]} end={[-0.3, 0.02, -0.2]} radius={0.105} color="#706c65" />
      <CylinderBetween start={[0.19, 0.31, -0.02]} end={[0.32, 0.43, -0.2]} radius={0.105} color="#706c65" />
      <mesh position={[-0.31, 0.01, -0.21]}><sphereGeometry args={[0.09, 10, 8]} /><meshStandardMaterial color="#9f7455" roughness={0.9} /></mesh>
      <mesh position={[0.32, 0.43, -0.21]}><sphereGeometry args={[0.085, 10, 8]} /><meshStandardMaterial color="#9f7455" roughness={0.9} /></mesh>

      <mesh position={[0, 0.57, -0.08]}>
        <sphereGeometry args={[0.18, 16, 12]} />
        <meshStandardMaterial color="#9a7356" roughness={0.92} />
      </mesh>
      <mesh position={[-0.066, 0.625, -0.235]} scale={[1, 0.62, 0.45]}>
        <sphereGeometry args={[0.024, 8, 6]} />
        <meshStandardMaterial color="#181513" roughness={0.8} />
      </mesh>
      <mesh position={[0.066, 0.625, -0.235]} scale={[1, 0.62, 0.45]}>
        <sphereGeometry args={[0.024, 8, 6]} />
        <meshStandardMaterial color="#181513" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.57, -0.255]} scale={[0.72, 1, 0.8]}>
        <sphereGeometry args={[0.045, 10, 8]} />
        <meshStandardMaterial color="#a98163" roughness={0.9} />
      </mesh>

      <mesh position={[0, 0.38, -0.205]} rotation={[0, 0, Math.PI]} scale={[1, 1, 0.58]}>
        <coneGeometry args={[0.18, 0.46, 12]} />
        <meshStandardMaterial color="#c5c0b6" roughness={1} />
      </mesh>
      <mesh position={[-0.095, 0.535, -0.245]} rotation={[0, 0, -0.25]} scale={[1, 0.42, 0.45]}>
        <sphereGeometry args={[0.095, 10, 8]} />
        <meshStandardMaterial color="#d0cbc1" roughness={1} />
      </mesh>
      <mesh position={[0.095, 0.535, -0.245]} rotation={[0, 0, 0.25]} scale={[1, 0.42, 0.45]}>
        <sphereGeometry args={[0.095, 10, 8]} />
        <meshStandardMaterial color="#d0cbc1" roughness={1} />
      </mesh>
      <mesh position={[-0.145, 0.48, -0.12]} scale={[0.45, 1.2, 0.45]}>
        <sphereGeometry args={[0.13, 10, 8]} />
        <meshStandardMaterial color="#aaa69e" roughness={1} />
      </mesh>
      <mesh position={[0.145, 0.48, -0.12]} scale={[0.45, 1.2, 0.45]}>
        <sphereGeometry args={[0.13, 10, 8]} />
        <meshStandardMaterial color="#aaa69e" roughness={1} />
      </mesh>

      <mesh position={[0, 0.69, -0.035]} scale={[1, 0.14, 0.9]}>
        <cylinderGeometry args={[0.35, 0.35, 0.2, 18]} />
        <meshStandardMaterial color="#686966" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <group rotation={[0, 0, -0.09]}>
        <mesh position={[0.025, 0.96, 0]}>
          <coneGeometry args={[0.245, 0.58, 14]} />
          <meshStandardMaterial color="#747570" roughness={1} />
        </mesh>
      </group>
      <mesh position={[0, 0.715, -0.035]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.218, 0.018, 6, 18]} />
        <meshStandardMaterial color="#3a3632" roughness={0.94} />
      </mesh>

      <Cigar />
      {questMarker ? <QuestMarker state={questMarker} positionY={1.58} /> : null}
    </>
  )
}

function HoodedMonk({ questMarker }: { questMarker: QuestMarkerState }) {
  return (
    <>
      <mesh><coneGeometry args={[0.42, 1.12, 7]} /><meshStandardMaterial color="#1b1416" roughness={1} /></mesh>
      <mesh position={[0, 0.54, -0.03]}><sphereGeometry args={[0.17, 10, 8]} /><meshStandardMaterial color="#755b40" roughness={0.95} /></mesh>
      <mesh position={[0, 0.7, -0.08]}><coneGeometry args={[0.29, 0.46, 7]} /><meshStandardMaterial color="#09080a" /></mesh>
      {questMarker ? <QuestMarker state={questMarker} /> : null}
    </>
  )
}

function MonasticIndexer({ questMarker }: { questMarker: QuestMarkerState }) {
  const prayerBeads = [
    [-0.23, 0.12, -0.28],
    [-0.19, 0.07, -0.3],
    [-0.14, 0.035, -0.31],
    [-0.085, 0.015, -0.315],
    [-0.03, 0.005, -0.318],
  ] as const
  return (
    <>
      <mesh position={[0, -0.04, 0.025]}>
        <coneGeometry args={[0.43, 1.04, 12]} />
        <meshStandardMaterial color="#4c281d" roughness={1} />
      </mesh>
      <mesh position={[0, 0.22, -0.005]} scale={[1, 0.72, 0.75]}>
        <sphereGeometry args={[0.32, 14, 10]} />
        <meshStandardMaterial color="#603527" roughness={1} />
      </mesh>
      <mesh position={[0, 0.12, -0.286]}>
        <boxGeometry args={[0.24, 0.72, 0.035]} />
        <meshStandardMaterial color="#704735" roughness={0.98} />
      </mesh>
      <mesh position={[0, 0.13, -0.03]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.9, 0.9]}>
        <torusGeometry args={[0.27, 0.035, 7, 16]} />
        <meshStandardMaterial color="#b49a6a" roughness={1} />
      </mesh>
      <CylinderBetween start={[-0.055, 0.12, -0.27]} end={[-0.085, -0.25, -0.315]} radius={0.014} color="#bca573" />
      <CylinderBetween start={[0.01, 0.12, -0.27]} end={[-0.015, -0.18, -0.32]} radius={0.014} color="#bca573" />
      <mesh position={[-0.087, -0.26, -0.315]}><sphereGeometry args={[0.032, 8, 6]} /><meshStandardMaterial color="#a88b55" roughness={1} /></mesh>
      <mesh position={[-0.015, -0.19, -0.32]}><sphereGeometry args={[0.03, 8, 6]} /><meshStandardMaterial color="#a88b55" roughness={1} /></mesh>

      <mesh position={[0, 0.59, 0.005]} scale={[1.25, 1.18, 0.85]}>
        <sphereGeometry args={[0.205, 14, 10]} />
        <meshStandardMaterial color="#432319" roughness={1} />
      </mesh>
      <mesh position={[0, 0.59, -0.095]}>
        <sphereGeometry args={[0.175, 16, 12]} />
        <meshStandardMaterial color="#9b6f50" roughness={0.94} />
      </mesh>
      <mesh position={[0, 0.705, -0.065]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.7]}>
        <torusGeometry args={[0.13, 0.045, 7, 16]} />
        <meshStandardMaterial color="#493025" roughness={1} />
      </mesh>
      <mesh position={[-0.062, 0.625, -0.25]} scale={[1, 0.62, 0.45]}>
        <sphereGeometry args={[0.023, 8, 6]} />
        <meshStandardMaterial color="#171311" roughness={0.85} />
      </mesh>
      <mesh position={[0.062, 0.625, -0.25]} scale={[1, 0.62, 0.45]}>
        <sphereGeometry args={[0.023, 8, 6]} />
        <meshStandardMaterial color="#171311" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.57, -0.27]} scale={[0.7, 1, 0.8]}>
        <sphereGeometry args={[0.043, 9, 7]} />
        <meshStandardMaterial color="#a77c5d" roughness={0.94} />
      </mesh>
      <mesh position={[0, 0.51, -0.255]} scale={[1, 0.36, 0.5]}>
        <sphereGeometry args={[0.085, 10, 7]} />
        <meshStandardMaterial color="#604333" roughness={1} />
      </mesh>

      <mesh position={[0, 0.43, -0.035]} rotation={[Math.PI / 2, 0, 0]} scale={[1.25, 1, 0.8]}>
        <torusGeometry args={[0.215, 0.085, 8, 18]} />
        <meshStandardMaterial color="#583125" roughness={1} />
      </mesh>
      <CylinderBetween start={[-0.2, 0.35, -0.08]} end={[0.15, 0.2, -0.3]} radius={0.095} color="#5a3023" />
      <CylinderBetween start={[0.2, 0.35, -0.08]} end={[-0.12, 0.18, -0.32]} radius={0.095} color="#673a2b" />
      <mesh position={[0.155, 0.195, -0.31]}><sphereGeometry args={[0.085, 10, 8]} /><meshStandardMaterial color="#9b6f50" roughness={0.94} /></mesh>
      <mesh position={[-0.125, 0.175, -0.33]}><sphereGeometry args={[0.082, 10, 8]} /><meshStandardMaterial color="#9b6f50" roughness={0.94} /></mesh>

      {prayerBeads.map((position, index) => (
        <mesh key={index} position={position}>
          <sphereGeometry args={[0.024, 7, 6]} />
          <meshStandardMaterial color="#2c1814" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0.005, -0.045, -0.32]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.05, 0.13, 0.025]} />
        <meshStandardMaterial color="#2c1814" roughness={1} />
      </mesh>

      {questMarker ? <QuestMarker state={questMarker} positionY={1.22} /> : null}
    </>
  )
}

function Cigar() {
  return (
    <group>
      <CylinderBetween start={[0.075, 0.555, -0.278]} end={[0.43, 0.5, -0.34]} radius={0.028} color="#71391f" />
      <CylinderBetween start={[0.305, 0.519, -0.318]} end={[0.332, 0.515, -0.323]} radius={0.031} color="#b18a4e" />
      <mesh position={[0.434, 0.499, -0.341]} scale={[0.42, 1, 1]}>
        <sphereGeometry args={[0.033, 10, 7]} />
        <meshStandardMaterial color="#502219" emissive="#d34b1d" emissiveIntensity={1.35} roughness={0.94} />
      </mesh>
      <CigarSmoke origin={[0.44, 0.53, -0.342]} />
    </group>
  )
}

const SMOKE_PHASES = [0, 0.24, 0.49, 0.74] as const

function CigarSmoke({ origin }: { origin: [number, number, number] }) {
  const puffRefs = useRef<Array<THREE.Mesh | null>>([])
  useFrame(({ clock }) => {
    SMOKE_PHASES.forEach((phase, index) => {
      const puff = puffRefs.current[index]
      if (!puff) return
      const progress = (clock.elapsedTime * 0.19 + phase) % 1
      const curl = Math.sin(progress * Math.PI * 4 + phase * 8) * (0.025 + progress * 0.075)
      puff.position.set(origin[0] + curl, origin[1] + progress * 0.68, origin[2] - progress * 0.035)
      const size = 0.65 + progress * 1.85
      puff.scale.setScalar(size)
      const material = puff.material as THREE.MeshBasicMaterial
      material.opacity = Math.sin(progress * Math.PI) * 0.24
    })
  })
  return (
    <>
      {SMOKE_PHASES.map((phase, index) => (
        <mesh key={phase} ref={(mesh) => { puffRefs.current[index] = mesh }}>
          <sphereGeometry args={[0.052, 10, 8]} />
          <meshBasicMaterial color="#c9c4bb" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </>
  )
}

function CylinderBetween({
  start,
  end,
  radius,
  color,
}: {
  start: [number, number, number]
  end: [number, number, number]
  radius: number
  color: string
}) {
  const transform = useMemo(() => {
    const startVector = new THREE.Vector3(...start)
    const endVector = new THREE.Vector3(...end)
    const direction = endVector.clone().sub(startVector)
    return {
      length: direction.length(),
      midpoint: startVector.add(endVector).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
    }
  }, [start, end])
  return (
    <mesh position={transform.midpoint} quaternion={transform.quaternion}>
      <cylinderGeometry args={[radius, radius, transform.length, 8]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  )
}

function QuestMarker({ state, positionY = 1.3 }: { state: Exclude<QuestMarkerState, null>; positionY?: number }) {
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
  return <sprite position={[0, positionY, 0]} scale={[0.4, 0.4, 1]}><spriteMaterial map={texture} transparent depthTest={false} /></sprite>
}

function ServiceRoomFloor({ room }: { room: 'sleeping' | 'latrine' }) {
  return (
    <group>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.48, 2.68]} />
        <meshStandardMaterial color={room === 'sleeping' ? '#51483d' : '#5a5a50'} roughness={1} />
      </mesh>
      {[-1.16, 0, 1.16].map((x) => (
        <mesh key={x} position={[x, 0.02, 0]}><boxGeometry args={[0.025, 0.02, 2.68]} /><meshStandardMaterial color="#35332e" roughness={1} /></mesh>
      ))}
      {[-0.89, 0, 0.89].map((z) => (
        <mesh key={z} position={[0, 0.021, z]}><boxGeometry args={[3.48, 0.021, 0.025]} /><meshStandardMaterial color="#35332e" roughness={1} /></mesh>
      ))}
    </group>
  )
}

function SleepingCloset() {
  return (
    <>
      <group position={[-1.42, 0, -0.12]}>
        <mesh position={[0, 1.22, 0]}><boxGeometry args={[0.24, 2.44, 1.18]} /><meshStandardMaterial color="#3f2d1f" roughness={1} /></mesh>
        {[-0.55, 0.55].map((z) => (
          <mesh key={z} position={[0.18, 1.2, z]}><boxGeometry args={[0.34, 2.4, 0.13]} /><meshStandardMaterial color="#594029" roughness={0.98} /></mesh>
        ))}
        <mesh position={[0.2, 2.38, 0]}><boxGeometry args={[0.48, 0.15, 1.24]} /><meshStandardMaterial color="#594029" roughness={0.98} /></mesh>
        <mesh position={[0.18, 1.34, 0]}><boxGeometry args={[0.13, 1.62, 0.86]} /><meshStandardMaterial color="#b1a27e" roughness={1} /></mesh>
        <mesh position={[0.28, 2.03, 0]} scale={[0.42, 0.72, 1]}><sphereGeometry args={[0.32, 12, 8]} /><meshStandardMaterial color="#d2c4a3" roughness={1} /></mesh>
        <mesh position={[0.28, 0.84, 0]}><boxGeometry args={[0.1, 0.72, 0.78]} /><meshStandardMaterial color="#75543b" roughness={1} /></mesh>
        <mesh position={[0.39, 0.92, 0]}><boxGeometry args={[0.4, 0.1, 1.02]} /><meshStandardMaterial color="#49331f" roughness={1} /></mesh>
        <mesh position={[0.42, 0.13, 0]}><boxGeometry args={[0.68, 0.16, 1.02]} /><meshStandardMaterial color="#49331f" roughness={0.98} /></mesh>
        {[-0.48, 0.48].map((z) => (
          <mesh key={z} position={[0.45, 1.38, z]}><boxGeometry args={[0.5, 0.08, 0.08]} /><meshStandardMaterial color="#65472b" roughness={0.96} /></mesh>
        ))}
      </group>
      <mesh position={[-0.1, 0.025, 0.82]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.15, 0.62]} />
        <meshStandardMaterial color="#6f6048" roughness={1} />
      </mesh>
      <group position={[-1.55, 1.25, -0.92]}>
        <mesh><boxGeometry args={[0.48, 0.07, 0.54]} /><meshStandardMaterial color="#553c28" roughness={1} /></mesh>
        <mesh position={[0.05, 0.06, 0]} rotation={[0, 0.12, 0]}><boxGeometry args={[0.26, 0.035, 0.36]} /><meshStandardMaterial color="#8d5c38" roughness={0.9} /></mesh>
        <mesh position={[-0.15, 0.16, 0]}><cylinderGeometry args={[0.045, 0.055, 0.21, 9]} /><meshStandardMaterial color="#d5b66c" emissive="#6d3e12" emissiveIntensity={0.35} /></mesh>
      </group>
      <group position={[0.25, 0, 0.79]}>
        <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.42, 0.4, 0.34]} /><meshStandardMaterial color="#4c3827" roughness={1} /></mesh>
        <mesh position={[-0.18, 0.5, 0]} rotation={[0, 0, -0.12]}><boxGeometry args={[0.12, 0.58, 0.12]} /><meshStandardMaterial color="#4c3827" roughness={1} /></mesh>
      </group>
    </>
  )
}

function Latrine() {
  return (
    <>
      <group position={[-1.24, 0, 0.38]}>
        <mesh position={[0, 0.36, 0]}><boxGeometry args={[0.82, 0.68, 1.45]} /><meshStandardMaterial color="#8b897b" roughness={1} /></mesh>
        <mesh position={[0.26, 0.71, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.2, 0.055, 8, 18]} /><meshStandardMaterial color="#b0ab96" roughness={0.9} /></mesh>
        <mesh position={[0.26, 0.685, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.145, 18]} /><meshStandardMaterial color="#27251f" roughness={1} /></mesh>
      </group>
      <group position={[-0.12, 0, -0.72]}>
        <mesh position={[0, 0.42, 0]}><cylinderGeometry args={[0.42, 0.34, 0.76, 12]} /><meshStandardMaterial color="#655f51" roughness={1} /></mesh>
        <mesh position={[0, 0.82, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.36, 0.055, 8, 20]} /><meshStandardMaterial color="#a9733e" metalness={0.45} roughness={0.58} /></mesh>
        <mesh position={[0, 0.78, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.32, 20]} /><meshStandardMaterial color="#4d6d70" metalness={0.26} roughness={0.28} /></mesh>
        <ClayVessel position={[0.35, 1.02, 0.08]} scale={1.15} />
      </group>
      <group position={[0.35, 1.42, 1.28]}>
        <mesh><boxGeometry args={[0.82, 0.055, 0.06]} /><meshStandardMaterial color="#725739" roughness={0.92} /></mesh>
        <mesh position={[-0.18, -0.34, 0]}><boxGeometry args={[0.34, 0.62, 0.045]} /><meshStandardMaterial color="#d0c5a5" roughness={1} /></mesh>
        <mesh position={[0.2, -0.26, 0]}><boxGeometry args={[0.3, 0.48, 0.045]} /><meshStandardMaterial color="#aaa78e" roughness={1} /></mesh>
      </group>
      <group position={[0.78, 0.18, 0.72]}>
        <mesh><cylinderGeometry args={[0.24, 0.2, 0.36, 12]} /><meshStandardMaterial color="#825c3b" roughness={1} /></mesh>
        <mesh position={[0, 0.2, 0]}><torusGeometry args={[0.2, 0.025, 6, 12]} /><meshStandardMaterial color="#9a704c" roughness={1} /></mesh>
      </group>
      <pointLight color="#c8e3d6" intensity={3.5} distance={3.8} decay={2} position={[-0.2, 1.4, -0.65]} />
    </>
  )
}

function VestibuleMirror({ reflective }: { reflective: boolean }) {
  return (
    <group position={VESTIBULE_MIRROR_POSITION} rotation={[0, Math.PI / 2, 0]}>
      {[-0.35, 0.35].map((x) => (
        <mesh key={x} position={[x, 0, 0.025]}>
          <boxGeometry args={[0.08, 1.6, 0.08]} />
          <meshStandardMaterial color="#33271e" roughness={0.92} />
        </mesh>
      ))}
      {[-0.76, 0.76].map((y) => (
        <mesh key={y} position={[0, y, 0.025]}>
          <boxGeometry args={[0.78, 0.08, 0.08]} />
          <meshStandardMaterial color="#33271e" roughness={0.92} />
        </mesh>
      ))}
      {reflective ? <PlanarMirrorSurface /> : (
        <mesh position={[0, 0, 0.035]}>
          <planeGeometry args={[0.62, 1.44]} />
          <meshStandardMaterial color="#363b39" metalness={0.7} roughness={0.28} />
        </mesh>
      )}
    </group>
  )
}

function PlanarMirrorSurface() {
  const geometry = useMemo(() => new THREE.PlaneGeometry(0.62, 1.44), [])
  const reflector = useMemo(() => new Reflector(geometry, {
    clipBias: 0.003,
    color: 0x70726d,
    textureWidth: 384,
    textureHeight: 384,
  }), [geometry])

  useEffect(() => () => {
    reflector.getRenderTarget().dispose()
    if (Array.isArray(reflector.material)) reflector.material.forEach((material) => material.dispose())
    else reflector.material.dispose()
    geometry.dispose()
  }, [geometry, reflector])

  return <primitive object={reflector} position={[0, 0, 0.035]} />
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

function vestibuleHelp(_floor: BookAddress['floor']): string {
  return 'west: sleeping closet / latrine · east stair: north lane up / south lane down'
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
