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
import { QUEST_TARGET_WORD } from './lib/quest'
import './App.css'

type MovementCue = 'idle' | 'step' | 'turn-left' | 'turn-right'

type HoldMovement = {
  forward: number
  strafe: number
}

const KEYBOARD_MOVE_SPEED_SCALE = 0.82
const TOUCH_MOVE_SPEED_SCALE = 0.68
const JUMP_START_VELOCITY = 3.2
const JUMP_GRAVITY = 9.2
const MIN_CAMERA_PITCH = -0.82
const MAX_CAMERA_PITCH = 0.72

function App() {
  const [playerPose, setPlayerPoseState] = useState<PlayerPose>({ ...STARTING_PLAYER_POSE })
  const [cameraPitch, setCameraPitch] = useState(0)
  const [jumpOffset, setJumpOffset] = useState(0)
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
  const cameraPitchRef = useRef(0)
  const modalOpenRef = useRef(false)
  const touchMovementRef = useRef<HoldMovement>({ forward: 0, strafe: 0 })
  const pressedKeysRef = useRef<Set<string>>(new Set())
  const jumpVelocityRef = useRef(0)
  const jumpOffsetRef = useRef(0)
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
  const modalOpen = readerOpen || splashOpen || dialogueNpc !== null

  useEffect(() => {
    modalOpenRef.current = modalOpen
    if (modalOpenRef.current) {
      touchMovementRef.current = { forward: 0, strafe: 0 }
      pressedKeysRef.current.clear()
    }
  }, [modalOpen])

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
        const keyboardMovement = movementFromPressedKeys(pressedKeysRef.current)
        const touchMovement = touchMovementRef.current
        const forward = clampAxis(keyboardMovement.forward + touchMovement.forward * TOUCH_MOVE_SPEED_SCALE)
        const strafe = clampAxis(keyboardMovement.strafe + touchMovement.strafe * TOUCH_MOVE_SPEED_SCALE)

        if (forward !== 0 || strafe !== 0) {
          movePlayer(forward, strafe, WALK_SPEED * KEYBOARD_MOVE_SPEED_SCALE * deltaSeconds, false)
        }

        if (jumpVelocityRef.current !== 0 || jumpOffsetRef.current > 0) {
          const nextVelocity = jumpVelocityRef.current - JUMP_GRAVITY * deltaSeconds
          const nextOffset = Math.max(0, jumpOffsetRef.current + nextVelocity * deltaSeconds)
          jumpVelocityRef.current = nextOffset === 0 ? 0 : nextVelocity
          jumpOffsetRef.current = nextOffset
          setJumpOffset(nextOffset)
        }
      }

      animationFrame = window.requestAnimationFrame(tick)
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [])

  useEffect(() => {
    const movementKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e', ' '])

    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      if (modalOpenRef.current || !movementKeys.has(key)) return

      event.preventDefault()
      if (key === ' ') {
        startJump()
        return
      }
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

  function setCameraPitchClamped(nextPitch: number) {
    const clampedPitch = Math.min(MAX_CAMERA_PITCH, Math.max(MIN_CAMERA_PITCH, nextPitch))
    cameraPitchRef.current = clampedPitch
    setCameraPitch(clampedPitch)
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
    touchMovementRef.current = { forward: 0, strafe: 0 }

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

  function lookPlayer(deltaYaw: number, deltaPitch: number) {
    rotatePlayer(deltaYaw)
    if (deltaPitch !== 0) {
      setCameraPitchClamped(cameraPitchRef.current + deltaPitch)
    }
  }

  function startJump() {
    if (jumpOffsetRef.current > 0 || jumpVelocityRef.current !== 0) return
    jumpVelocityRef.current = JUMP_START_VELOCITY
    setMessage('You jump.')
  }

  function interact() {
    if (readerOpen || splashOpen || dialogueNpc !== null) return
    const pose = playerPoseRef.current
    const selectedDoor = yawToDirection(pose.yaw)
    if (roomDoors(roomPositionFromPose(pose)).includes(selectedDoor)) {
      openDoor(selectedDoor)
      return
    }
    if (currentNpc && isNpcReachable(playerPoseRef.current, currentNpc)) {
      talkToNpc()
      return
    }
    openBook(nearbyBookAddress(pose.roomQ, pose.roomR, yawToDirection(pose.yaw), selectedBook.shelf, selectedBook.book))
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

  function completeSignificantWordQuest() {
    setWordQuestStatus('completed')
    setWordQuestFeedback({
      tone: 'success',
      text: 'Quest complete. The keeper marks the coordinate into the impossible ledger.',
    })
    setMessage('Quest complete: Find "babel".')
  }

  return (
    <main className="arena-shell">
      <section className={`game-frame ${modalOpen ? 'ui-modal-open' : ''}`} aria-label="Library game viewport">
        <div className={`scene scene-library movement-${movementCue}`}>
          <ArenaViewport
            playerPose={playerPose}
            currentRoom={currentRoom}
            roomName={room.name}
            roomKind={room.kind}
            doors={doors}
            selectedBook={selectedBook}
            movementCue={movementCue}
            cameraPitch={cameraPitch}
            jumpOffset={jumpOffset}
            facingLabel={facingLabel}
            npc={currentNpc}
            questMarker={questMarker}
            canTalkToNpc={canTalkToNpc && dialogueNpc === null}
            onOpenBook={openBook}
            onOpenDoor={openDoor}
            onTalkToNpc={talkToNpc}
            onLook={lookPlayer}
            onInteract={interact}
            onJump={startJump}
            onTouchMoveChange={(movement) => {
              touchMovementRef.current = movement
            }}
          />
        </div>

        <div className="message-bar" role="status">
          {message}
        </div>
        {wordQuestStatus === 'accepted' || wordQuestStatus === 'ready-to-complete' ? (
          <aside className={`quest-tracker ${wordQuestStatus}`} aria-label="Quest tracker">
            <span>{wordQuestStatus === 'ready-to-complete' ? 'Ready to turn in' : 'Quest accepted'}</span>
            <strong>Find "{QUEST_TARGET_WORD}"</strong>
            <p>
              {wordQuestStatus === 'ready-to-complete'
                ? 'Return to the hooded keeper.'
                : 'Find a page containing the word and report its coordinates.'}
            </p>
          </aside>
        ) : null}
        <div className="control-readout" aria-label="Current position and controls">
          <strong>{room.name}</strong>
          <span>{`room ${currentRoom.q},${currentRoom.r} / ${facingLabel} view`}</span>
          <span>WASD move. Mouse or swipe looks. Click, tap, or touch to interact. Space jumps.</span>
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
          onCompleteSignificantWordQuest={completeSignificantWordQuest}
        />
      ) : null}
    </main>
  )
}

function clampAxis(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

function movementFromPressedKeys(keys: Set<string>): HoldMovement {
  const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'))
  const strafe = Number(keys.has('d') || keys.has('arrowright') || keys.has('e')) - Number(keys.has('a') || keys.has('arrowleft') || keys.has('q'))

  return {
    forward: clampAxis(forward),
    strafe: clampAxis(strafe),
  }
}

function questMarkerForNpc(npc: LibraryNpc | null, status: WordQuestStatus): QuestMarkerState {
  if (npc?.quest !== 'significant-word' || status === 'completed') return null
  if (status === 'ready-to-complete') return 'complete'
  return status === 'not-started' ? 'available' : 'active'
}

export default App
