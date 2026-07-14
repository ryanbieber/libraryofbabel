import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Compass,
  Gauge,
  Home,
  RotateCcw,
  RotateCw,
} from 'lucide-react'
import { ArenaViewport, type QuestMarkerState } from './ArenaViewport'
import { BookReader } from './components/BookReader'
import { NpcDialoguePanel } from './components/NpcDialoguePanel'
import { SplashScreen } from './components/SplashScreen'
import {
  cardinalDirections,
  nearestRoom,
  roomDoors,
  type DirectionIndex,
} from './lib/level'
import type { BookAddress } from './lib/library'
import {
  defaultAddress,
  generatePage,
  nearbyBookAddress,
} from './lib/library'
import { spreadToLeftPage, spreadToRightPage } from './lib/bookSpread'
import {
  STARTING_PLAYER_POSE,
  STEP_DISTANCE,
  WALK_SPEED,
  directionLabel,
  enterDoor,
  isBookReachable,
  isDoorReachable,
  movePose,
  roomPositionFromPose,
  rotatePose,
  yawToDirection,
  type PlayerPose,
} from './lib/roomGeometry'
import { isNpcReachable, npcForRoom, type LibraryNpc } from './lib/npcs'
import {
  resolveSignificantWordQuestSubmission,
  type WordQuestFeedback,
  type WordQuestFormValues,
  type WordQuestStatus,
} from './lib/significantWordQuest'
import './App.css'

type MovementCue = 'idle' | 'step' | 'turn-left' | 'turn-right'

type HoldMovement = {
  forward: number
  strafe: number
  turnSlowdown: number
}

const HOLD_FORWARD_SPEED_SCALE = 0.62
const HOLD_INITIAL_STEP_SCALE = 0.16
const HOLD_ACCELERATION_PER_SECOND = 1.25
const HOLD_DECELERATION_PER_SECOND = 4.2
const KEYBOARD_STEP_SCALE = 0.58
const HUD_STEP_SCALE = 0.92
const HUD_TURN_RADIANS = Math.PI / 2
const SPEED_OPTIONS = [0.75, 1, 1.35, 1.7, 2] as const

type MovementAction = 'forward' | 'back' | 'left' | 'right' | 'turn-left' | 'turn-right' | 'home'

function App() {
  const [playerPose, setPlayerPoseState] = useState<PlayerPose>({ ...STARTING_PLAYER_POSE })
  const [selectedBook, setSelectedBook] = useState<BookAddress>(defaultAddress)
  const [readerOpen, setReaderOpen] = useState(false)
  const [dialogueNpc, setDialogueNpc] = useState<LibraryNpc | null>(null)
  const [wordQuestStatus, setWordQuestStatus] = useState<WordQuestStatus>('not-started')
  const [wordQuestFeedback, setWordQuestFeedback] = useState<WordQuestFeedback | null>(null)
  const [splashOpen, setSplashOpen] = useState(true)
  const [movementCue, setMovementCue] = useState<MovementCue>('idle')
  const [movementSpeedIndex, setMovementSpeedIndex] = useState(1)
  const [spread, setSpread] = useState(1)
  const [message, setMessage] = useState('The door seals behind you. The shelves breathe dust.')
  const playerPoseRef = useRef<PlayerPose>({ ...STARTING_PLAYER_POSE })
  const modalOpenRef = useRef(false)
  const holdMovementRef = useRef<HoldMovement>({ forward: 0, strafe: 0, turnSlowdown: 0 })
  const holdForwardRampRef = useRef(0)
  const pressedKeysRef = useRef<Set<string>>(new Set())
  const movementSpeedRef = useRef<number>(SPEED_OPTIONS[1])
  const cueTimeout = useRef<number | null>(null)

  const leftPageNumber = spreadToLeftPage(spread)
  const rightPageNumber = spreadToRightPage(spread)
  const generatedPage = useMemo(() => generatePage({ ...selectedBook, page: leftPageNumber }), [selectedBook, leftPageNumber])
  const nextGeneratedPage = useMemo(() => generatePage({ ...selectedBook, page: rightPageNumber }), [selectedBook, rightPageNumber])
  const currentRoom = roomPositionFromPose(playerPose)
  const room = nearestRoom(currentRoom)
  const doors = roomDoors(currentRoom)
  const facing = yawToDirection(playerPose.yaw)
  const facingLabel = cardinalDirections[facing].label
  const currentNpc = useMemo(
    () => npcForRoom(0, { q: currentRoom.q, r: currentRoom.r }),
    [currentRoom.q, currentRoom.r],
  )
  const canTalkToNpc = isNpcReachable(playerPose, currentNpc)
  const questMarker = questMarkerForNpc(currentNpc, wordQuestStatus)
  const movementSpeed = SPEED_OPTIONS[movementSpeedIndex]

  useEffect(() => {
    modalOpenRef.current = readerOpen || splashOpen || dialogueNpc !== null
    if (modalOpenRef.current) {
      holdMovementRef.current = { forward: 0, strafe: 0, turnSlowdown: 0 }
      holdForwardRampRef.current = 0
      pressedKeysRef.current.clear()
    }
  }, [readerOpen, splashOpen, dialogueNpc])

  useEffect(() => {
    movementSpeedRef.current = movementSpeed
  }, [movementSpeed])

  useEffect(() => {
    setDialogueNpc(null)
  }, [currentRoom.q, currentRoom.r])

  useEffect(() => {
    let animationFrame = 0
    let lastFrame = performance.now()

    function tick(now: number) {
      const deltaSeconds = Math.min(0.05, (now - lastFrame) / 1000)
      lastFrame = now

      if (!modalOpenRef.current) {
        const holdMovement = holdMovementRef.current
        const holdForwardTarget = holdMovement.forward * (1 - holdMovement.turnSlowdown) * HOLD_FORWARD_SPEED_SCALE
        holdForwardRampRef.current = moveToward(
          holdForwardRampRef.current,
          holdForwardTarget,
          (holdForwardTarget > holdForwardRampRef.current ? HOLD_ACCELERATION_PER_SECOND : HOLD_DECELERATION_PER_SECOND) * deltaSeconds,
        )
        const forward = clampAxis(holdForwardRampRef.current)
        const strafe = clampAxis(holdMovement.strafe * HOLD_FORWARD_SPEED_SCALE)
        if (forward !== 0 || strafe !== 0) {
          movePlayer(forward, strafe, WALK_SPEED * deltaSeconds * movementSpeedRef.current, false)
        }

        const keyboardMovement = movementFromPressedKeys(pressedKeysRef.current)
        if (keyboardMovement.forward !== 0 || keyboardMovement.strafe !== 0) {
          movePlayer(
            keyboardMovement.forward,
            keyboardMovement.strafe,
            WALK_SPEED * KEYBOARD_STEP_SCALE * deltaSeconds * movementSpeedRef.current,
            false,
          )
        }
        if (keyboardMovement.turn !== 0) {
          rotatePlayer(keyboardMovement.turn * WALK_SPEED * 0.72 * deltaSeconds)
        }
      }

      animationFrame = window.requestAnimationFrame(tick)
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [])

  useEffect(() => {
    const movementKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e'])

    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      if (modalOpenRef.current || !movementKeys.has(key)) return

      event.preventDefault()
      pressedKeysRef.current.add(key)
    }

    function handleKeyUp(event: KeyboardEvent) {
      pressedKeysRef.current.delete(event.key.toLowerCase())
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(
    () => () => {
      if (cueTimeout.current !== null) {
        window.clearTimeout(cueTimeout.current)
      }
    },
    [],
  )

  function setPlayerPose(nextPose: PlayerPose) {
    playerPoseRef.current = nextPose
    setPlayerPoseState(nextPose)
  }

  function triggerCue(cue: MovementCue) {
    setMovementCue(cue)
    if (cueTimeout.current !== null) {
      window.clearTimeout(cueTimeout.current)
    }
    cueTimeout.current = window.setTimeout(() => setMovementCue('idle'), 220)
  }

  function movePlayer(forward: number, strafe: number, distance: number, showBlockedMessage = true) {
    const result = movePose(playerPoseRef.current, forward, strafe, distance)
    setPlayerPose(result.pose)

    if (result.crossed !== undefined) {
      completeDoorTransition(result.crossed, result.pose, showBlockedMessage)
      return
    }

    if (result.blocked !== undefined) {
      if (showBlockedMessage) {
        setMessage(
          result.door !== undefined
            ? `The ${directionLabel(result.door)} door is shut. Click or tap it to open it.`
            : `The ${directionLabel(result.blocked)} wall has no open passage here.`,
        )
        triggerCue('step')
      }
      return
    }

    if (showBlockedMessage) {
      triggerCue('step')
    }
  }

  function openDoor(direction: DirectionIndex) {
    const pose = playerPoseRef.current
    const availableDoors = roomDoors(roomPositionFromPose(pose))
    holdMovementRef.current = { forward: 0, strafe: 0, turnSlowdown: 0 }
    holdForwardRampRef.current = 0

    if (!availableDoors.includes(direction)) {
      setMessage(`The ${directionLabel(direction)} wall has no open passage here.`)
      triggerCue('step')
      return
    }
    if (!isDoorReachable(pose, direction)) {
      setMessage(`Move closer to the ${directionLabel(direction)} door.`)
      triggerCue('step')
      return
    }

    const result = enterDoor(pose, direction)
    if (result.crossed !== undefined) {
      completeDoorTransition(result.crossed, result.pose)
    }
  }

  function completeDoorTransition(direction: DirectionIndex, pose: PlayerPose, showCue = true) {
    const destination = nearestRoom(roomPositionFromPose(pose))
    setPlayerPose(pose)
    setReaderOpen(false)
    setDialogueNpc(null)
    setSelectedBook((current) => nearbyBookAddress(pose.roomQ, pose.roomR, yawToDirection(pose.yaw), current.shelf, current.book))
    setMessage(`You open the ${directionLabel(direction)} door and enter ${destination.name}.`)
    if (showCue) triggerCue('step')
  }

  function rotatePlayer(deltaYaw: number, cue?: MovementCue) {
    const nextPose = rotatePose(playerPoseRef.current, deltaYaw)
    setPlayerPose(nextPose)
    setSelectedBook((current) =>
      nearbyBookAddress(nextPose.roomQ, nextPose.roomR, yawToDirection(nextPose.yaw), current.shelf, current.book),
    )

    if (cue) {
      triggerCue(cue)
      setMessage(`You turn to face the ${cardinalDirections[yawToDirection(nextPose.yaw)].label} shelves.`)
    }
  }

  function resetPlayer() {
    const nextPose = { ...STARTING_PLAYER_POSE }
    holdMovementRef.current = { forward: 0, strafe: 0, turnSlowdown: 0 }
    holdForwardRampRef.current = 0
    pressedKeysRef.current.clear()
    setPlayerPose(nextPose)
    setSelectedBook((current) =>
      nearbyBookAddress(nextPose.roomQ, nextPose.roomR, yawToDirection(nextPose.yaw), current.shelf, current.book),
    )
    setReaderOpen(false)
    setDialogueNpc(null)
    setMessage('You return to the first gallery.')
  }

  function runMovementAction(action: MovementAction) {
    if (modalOpenRef.current) return

    const stepDistance = STEP_DISTANCE * HUD_STEP_SCALE * movementSpeedRef.current
    if (action === 'forward') movePlayer(1, 0, stepDistance)
    if (action === 'back') movePlayer(-1, 0, stepDistance)
    if (action === 'left') movePlayer(0, -1, stepDistance)
    if (action === 'right') movePlayer(0, 1, stepDistance)
    if (action === 'turn-left') rotatePlayer(-HUD_TURN_RADIANS, 'turn-left')
    if (action === 'turn-right') rotatePlayer(HUD_TURN_RADIANS, 'turn-right')
    if (action === 'home') resetPlayer()
  }

  function openBook(address: BookAddress) {
    setSelectedBook(address)
    setDialogueNpc(null)
    if (!isBookReachable(playerPoseRef.current, address)) {
      const wall = cardinalDirections[address.wall].label
      setReaderOpen(false)
      setMessage(`That volume is too far away. Move closer to the ${wall} shelves.`)
      return
    }

    setSpread(1)
    setReaderOpen(true)
    setMessage('The volume opens like dry leather.')
  }

  function talkToNpc() {
    if (!currentNpc) return
    if (!isNpcReachable(playerPoseRef.current, currentNpc)) {
      setDialogueNpc(null)
      setMessage('Move closer to the hooded monk at the reading table.')
      return
    }

    setReaderOpen(false)
    setDialogueNpc(currentNpc)
    if (currentNpc.quest === 'significant-word') {
      setMessage('The hooded monk offers a quest from the open book.')
      return
    }

    setMessage('The hooded monk raises two ink-stained fingers from the open book.')
  }

  function acceptSignificantWordQuest() {
    setWordQuestStatus((current) => current === 'not-started' ? 'accepted' : current)
    setWordQuestFeedback(null)
    setMessage('The hooded monk waits for room, wall, shelf, volume, and page.')
  }

  function submitSignificantWordQuest(values: WordQuestFormValues) {
    const result = resolveSignificantWordQuestSubmission(values, wordQuestStatus)
    if (result.nextStatus !== undefined) {
      setWordQuestStatus(result.nextStatus)
    }
    setWordQuestFeedback(result.feedback)
    setMessage(result.message)
  }

  return (
    <main className="arena-shell">
      <section className="game-frame" aria-label="Library game viewport">
        <div className={`scene scene-library movement-${movementCue}`}>
          <ArenaViewport
            playerPose={playerPose}
            currentRoom={currentRoom}
            roomName={room.name}
            roomKind={room.kind}
            doors={doors}
            selectedBook={selectedBook}
            movementCue={movementCue}
            facingLabel={facingLabel}
            npc={currentNpc}
            questMarker={questMarker}
            canTalkToNpc={canTalkToNpc && dialogueNpc === null}
            onOpenBook={openBook}
            onOpenDoor={openDoor}
            onTalkToNpc={talkToNpc}
            onLook={(deltaYaw) => rotatePlayer(deltaYaw)}
            onHoldForwardStart={() => movePlayer(1, 0, STEP_DISTANCE * HOLD_INITIAL_STEP_SCALE)}
            onHoldMoveChange={(movement) => {
              holdMovementRef.current = movement
            }}
          />
        </div>

        <div className="message-bar" role="status">
          {message}
        </div>
        <MovementControlHud
          roomName={room.name}
          roomCoordinates={`${currentRoom.q},${currentRoom.r}`}
          facingLabel={facingLabel}
          yaw={playerPose.yaw}
          speedIndex={movementSpeedIndex}
          speed={movementSpeed}
          onSpeedChange={setMovementSpeedIndex}
          onAction={runMovementAction}
        />
      </section>

      {splashOpen ? <SplashScreen onStart={() => setSplashOpen(false)} /> : null}

      {readerOpen ? (
        <BookReader
          selectedBook={selectedBook}
          spread={spread}
          leftPageNumber={leftPageNumber}
          rightPageNumber={rightPageNumber}
          leftPage={generatedPage}
          rightPage={nextGeneratedPage}
          onClose={() => setReaderOpen(false)}
          onSpreadChange={setSpread}
        />
      ) : null}

      {dialogueNpc ? (
        <NpcDialoguePanel
          npc={dialogueNpc}
          questStatus={wordQuestStatus}
          questFeedback={wordQuestFeedback}
          onClose={() => setDialogueNpc(null)}
          onAcceptSignificantWordQuest={acceptSignificantWordQuest}
          onSubmitSignificantWordQuest={submitSignificantWordQuest}
        />
      ) : null}
    </main>
  )
}

function clampAxis(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target
  return current + Math.sign(target - current) * maxDelta
}

function movementFromPressedKeys(keys: Set<string>): { forward: number; strafe: number; turn: number } {
  const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'))
  const strafe = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'))
  const turn = Number(keys.has('e')) - Number(keys.has('q'))

  return {
    forward: clampAxis(forward),
    strafe: clampAxis(strafe),
    turn: clampAxis(turn),
  }
}

function MovementControlHud({
  roomName,
  roomCoordinates,
  facingLabel,
  yaw,
  speedIndex,
  speed,
  onSpeedChange,
  onAction,
}: {
  roomName: string
  roomCoordinates: string
  facingLabel: string
  yaw: number
  speedIndex: number
  speed: number
  onSpeedChange: (index: number) => void
  onAction: (action: MovementAction) => void
}) {
  return (
    <aside className="movement-hud" aria-label="Movement controls">
      <div className="movement-hud-status" aria-label="Current position and orientation">
        <div>
          <span>Room</span>
          <strong>{roomName}</strong>
        </div>
        <div>
          <span>Axis</span>
          <strong>{roomCoordinates}</strong>
        </div>
        <div>
          <span>Facing</span>
          <strong>{facingLabel}</strong>
        </div>
      </div>

      <div className="movement-hud-body">
        <div className="movement-pad" aria-label="Directional movement">
          <HudButton action="forward" label="Move forward" onAction={onAction}>
            <ArrowUp aria-hidden="true" size={18} strokeWidth={2.5} />
          </HudButton>
          <HudButton action="left" label="Move left" onAction={onAction}>
            <ArrowLeft aria-hidden="true" size={18} strokeWidth={2.5} />
          </HudButton>
          <HudButton action="home" label="Return home" onAction={onAction}>
            <Home aria-hidden="true" size={16} strokeWidth={2.5} />
          </HudButton>
          <HudButton action="right" label="Move right" onAction={onAction}>
            <ArrowRight aria-hidden="true" size={18} strokeWidth={2.5} />
          </HudButton>
          <HudButton action="back" label="Move backward" onAction={onAction}>
            <ArrowDown aria-hidden="true" size={18} strokeWidth={2.5} />
          </HudButton>
        </div>

        <div className="movement-orientation" aria-label="Turn controls">
          <HudButton action="turn-left" label="Turn left" onAction={onAction}>
            <RotateCcw aria-hidden="true" size={18} strokeWidth={2.5} />
          </HudButton>
          <div className="movement-bearing" aria-label={`Facing ${facingLabel}`}>
            <Compass aria-hidden="true" size={28} strokeWidth={1.8} style={{ transform: `rotate(${-yaw}rad)` }} />
            <span>{facingLabel.slice(0, 1)}</span>
          </div>
          <HudButton action="turn-right" label="Turn right" onAction={onAction}>
            <RotateCw aria-hidden="true" size={18} strokeWidth={2.5} />
          </HudButton>
        </div>
      </div>

      <label className="movement-speed">
        <span>
          <Gauge aria-hidden="true" size={15} strokeWidth={2.4} />
          Speed
        </span>
        <input
          type="range"
          min={0}
          max={SPEED_OPTIONS.length - 1}
          step={1}
          value={speedIndex}
          aria-label="Movement speed"
          onChange={(event) => onSpeedChange(Number(event.currentTarget.value))}
        />
        <strong>{speed.toFixed(2).replace(/\.?0+$/, '')}x</strong>
      </label>
    </aside>
  )
}

function HudButton({
  action,
  label,
  onAction,
  children,
}: {
  action: MovementAction
  label: string
  onAction: (action: MovementAction) => void
  children: ReactNode
}) {
  return (
    <button type="button" className={`movement-button movement-${action}`} aria-label={label} onClick={() => onAction(action)}>
      {children}
    </button>
  )
}

function questMarkerForNpc(npc: LibraryNpc | null, status: WordQuestStatus): QuestMarkerState {
  if (npc?.quest !== 'significant-word' || status === 'completed') return null
  return status === 'not-started' ? 'available' : 'active'
}

export default App
