import { useEffect, useMemo, useRef, useState } from 'react'
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

function App() {
  const [playerPose, setPlayerPoseState] = useState<PlayerPose>({ ...STARTING_PLAYER_POSE })
  const [selectedBook, setSelectedBook] = useState<BookAddress>(defaultAddress)
  const [readerOpen, setReaderOpen] = useState(false)
  const [dialogueNpc, setDialogueNpc] = useState<LibraryNpc | null>(null)
  const [wordQuestStatus, setWordQuestStatus] = useState<WordQuestStatus>('not-started')
  const [wordQuestFeedback, setWordQuestFeedback] = useState<WordQuestFeedback | null>(null)
  const [splashOpen, setSplashOpen] = useState(true)
  const [movementCue, setMovementCue] = useState<MovementCue>('idle')
  const [spread, setSpread] = useState(1)
  const [message, setMessage] = useState('The door seals behind you. The shelves breathe dust.')
  const playerPoseRef = useRef<PlayerPose>({ ...STARTING_PLAYER_POSE })
  const modalOpenRef = useRef(false)
  const holdMovementRef = useRef<HoldMovement>({ forward: 0, strafe: 0, turnSlowdown: 0 })
  const holdForwardRampRef = useRef(0)
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

  useEffect(() => {
    modalOpenRef.current = readerOpen || splashOpen || dialogueNpc !== null
    if (modalOpenRef.current) {
      holdMovementRef.current = { forward: 0, strafe: 0, turnSlowdown: 0 }
      holdForwardRampRef.current = 0
    }
  }, [readerOpen, splashOpen, dialogueNpc])

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
          movePlayer(forward, strafe, WALK_SPEED * deltaSeconds, false)
        }
      }

      animationFrame = window.requestAnimationFrame(tick)
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
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

function questMarkerForNpc(npc: LibraryNpc | null, status: WordQuestStatus): QuestMarkerState {
  if (npc?.quest !== 'significant-word' || status === 'completed') return null
  return status === 'not-started' ? 'available' : 'active'
}

export default App
