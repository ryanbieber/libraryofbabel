import { X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ArenaViewport } from './ArenaViewport'
import {
  cardinalDirections,
  nearestRoom,
  roomDoors,
  roomHasFeature,
  type DirectionIndex,
} from './lib/level'
import type { BookAddress } from './lib/library'
import {
  addressLabel,
  clampPage,
  defaultAddress,
  generatePage,
  nearbyBookAddress,
  PAGES_PER_BOOK,
} from './lib/library'
import {
  BOOK_INTERACTION_RADIUS,
  STARTING_PLAYER_POSE,
  STEP_DISTANCE,
  WALK_SPEED,
  booksForRoom,
  directionLabel,
  distanceToBook,
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
import { highlightPage, type HighlightSegment } from './lib/words'
import './App.css'

type MovementCue = 'idle' | 'step' | 'turn-left' | 'turn-right'

type NearbyBook = {
  address: BookAddress
  distance: number
}

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
  const [floor, setFloor] = useState(0)
  const [playerPose, setPlayerPoseState] = useState<PlayerPose>({ ...STARTING_PLAYER_POSE })
  const [selectedBook, setSelectedBook] = useState<BookAddress>(defaultAddress)
  const [readerOpen, setReaderOpen] = useState(false)
  const [dialogueNpc, setDialogueNpc] = useState<LibraryNpc | null>(null)
  const [splashOpen, setSplashOpen] = useState(true)
  const [movementCue, setMovementCue] = useState<MovementCue>('idle')
  const [spread, setSpread] = useState(1)
  const [message, setMessage] = useState('The door seals behind you. The shelves breathe dust.')
  const playerPoseRef = useRef<PlayerPose>({ ...STARTING_PLAYER_POSE })
  const modalOpenRef = useRef(false)
  const keyActionRef = useRef<(key: string) => void>(() => undefined)
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
    () => npcForRoom(floor, { q: currentRoom.q, r: currentRoom.r }),
    [floor, currentRoom.q, currentRoom.r],
  )
  const canTalkToNpc = isNpcReachable(playerPose, currentNpc)
  const canUseStairsUp = roomHasFeature(currentRoom, 'stairs-up')
  const canUseStairsDown = roomHasFeature(currentRoom, 'stairs-down')
  const nearbyBooks: NearbyBook[] = useMemo(
    () =>
      booksForRoom(currentRoom.q, currentRoom.r)
        .map((address) => ({ address, distance: distanceToBook(playerPose, address) }))
        .filter((candidate) => candidate.distance <= BOOK_INTERACTION_RADIUS)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 6),
    [currentRoom.q, currentRoom.r, playerPose],
  )

  keyActionRef.current = (key) => {
    switch (key) {
      case 'e':
        activateStairs()
        break
    }
  }

  useEffect(() => {
    modalOpenRef.current = readerOpen || splashOpen || dialogueNpc !== null
    if (modalOpenRef.current) {
      holdMovementRef.current = { forward: 0, strafe: 0, turnSlowdown: 0 }
      holdForwardRampRef.current = 0
    }
  }, [readerOpen, splashOpen, dialogueNpc])

  useEffect(() => {
    setDialogueNpc(null)
  }, [floor, currentRoom.q, currentRoom.r])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (modalOpenRef.current || isTypingTarget(event.target)) return

      if (event.key.toLowerCase() === 'e') {
        event.preventDefault()
        if (!event.repeat) {
          keyActionRef.current('e')
        }
        return
      }

    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

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

  function changeFloor(delta: number) {
    if (delta > 0 && !canUseStairsUp) {
      setMessage('There are no stairs up in this room.')
      return
    }
    if (delta < 0 && !canUseStairsDown) {
      setMessage('There are no stairs down in this room.')
      return
    }

    setFloor((current) => current + delta)
    setReaderOpen(false)
    setDialogueNpc(null)
    setMessage(delta > 0 ? 'You climb to the next floor. The floor plan repeats.' : 'You descend. The same floor plan waits below.')
  }

  function activateStairs() {
    if (canUseStairsUp) {
      changeFloor(1)
      return
    }
    if (canUseStairsDown) {
      changeFloor(-1)
      return
    }

    setMessage('There are no stairs in this room.')
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
    setMessage('The hooded monk raises two ink-stained fingers from the open book.')
  }

  return (
    <main className="arena-shell">
      <section className="game-frame" aria-label="Library game viewport">
        <div className={`scene scene-library movement-${movementCue}`}>
          <ArenaViewport
            floor={floor}
            playerPose={playerPose}
            currentRoom={currentRoom}
            roomName={room.name}
            doors={doors}
            selectedBook={selectedBook}
            movementCue={movementCue}
            facingLabel={facingLabel}
            nearbyBooks={nearbyBooks}
            npc={currentNpc}
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
          floor={floor}
          spread={spread}
          leftPageNumber={leftPageNumber}
          rightPageNumber={rightPageNumber}
          leftPage={generatedPage}
          rightPage={nextGeneratedPage}
          onClose={() => setReaderOpen(false)}
          onSpreadChange={setSpread}
        />
      ) : null}

      {dialogueNpc ? <NpcDialoguePanel npc={dialogueNpc} onClose={() => setDialogueNpc(null)} /> : null}
    </main>
  )
}

function SplashScreen({ onStart }: { onStart: () => void }) {
  return (
    <section className="splash-screen" aria-label="Start screen">
      <div className="splash-panel">
        <p className="splash-kicker">Library of Babel</p>
        <h1>Enter the stacks</h1>
        <p>Hold the room to walk forward. Drag while holding to look around.</p>
        <p>Mouse and touch use the same movement: hold to advance, swipe or drag to turn.</p>
        <p>Click or tap a nearby volume or door to open it. Press E in a stair room.</p>
        <button type="button" onClick={onStart}>
          Enter Library
        </button>
      </div>
    </section>
  )
}

function BookReader({
  selectedBook,
  floor,
  spread,
  leftPageNumber,
  rightPageNumber,
  leftPage,
  rightPage,
  onClose,
  onSpreadChange,
}: {
  selectedBook: BookAddress
  floor: number
  spread: number
  leftPageNumber: number
  rightPageNumber: number
  leftPage: string[]
  rightPage: string[]
  onClose: () => void
  onSpreadChange: (spread: number | ((current: number) => number)) => void
}) {
  return (
    <section className="book-reader" aria-label="Open book reader">
      <div className="book-shell">
        <button type="button" className="close-reader" aria-label="Close book" onClick={onClose}>
          <X size={22} aria-hidden="true" />
        </button>
        <div className="book-cover">
          <div className="book-spread">
            <article className="book-page left">
              <span>floor {floor} / {addressLabel(selectedBook)}</span>
              <h2>page {leftPageNumber}</h2>
              <HighlightedPage lines={leftPage} />
            </article>
            <article className="book-page right">
              <span>floor {floor} / {addressLabel(selectedBook)}</span>
              <h2>page {rightPageNumber}</h2>
              <HighlightedPage lines={rightPage} />
            </article>
          </div>
        </div>
        <div className="reader-actions">
          <button type="button" onClick={() => onSpreadChange((current) => clampSpread(current - 1))}>
            back
          </button>
          <label>
            spread
            <input
              value={spread}
              aria-label="Spread number"
              inputMode="numeric"
              onChange={(event) => onSpreadChange(clampSpread(Number(event.target.value)))}
            />
          </label>
          <button type="button" onClick={() => onSpreadChange((current) => clampSpread(current + 1))}>
            forward
          </button>
        </div>
      </div>
    </section>
  )
}

function NpcDialoguePanel({ npc, onClose }: { npc: LibraryNpc; onClose: () => void }) {
  return (
    <section className="npc-dialogue" aria-label="Monk dialogue">
      <div className="npc-dialogue-panel">
        <button type="button" className="close-reader" aria-label="Close monk dialogue" onClick={onClose}>
          <X size={22} aria-hidden="true" />
        </button>
        <p className="splash-kicker">{npc.quest === 'messiah' ? 'Man of the Book' : 'Crimson rumor'}</p>
        <h2>{npc.name}</h2>
        <div className="npc-dialogue-lines">
          {npc.dialogue.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    </section>
  )
}

function HighlightedPage({ lines }: { lines: string[] }) {
  const highlightedLines = useMemo(() => highlightPage(lines), [lines])

  return <pre>{highlightedLines.map((line, lineIndex) => (
    <Fragment key={`${lineIndex}:${line.length}`}>
      <HighlightedLine segments={line} />
      {lineIndex < highlightedLines.length - 1 ? '\n' : null}
    </Fragment>
  ))}</pre>
}

function HighlightedLine({ segments }: { segments: HighlightSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.highlight ? (
          <mark key={`${index}:${segment.text}`} className="english-word">
            {segment.text}
          </mark>
        ) : (
          <Fragment key={`${index}:${segment.text}`}>{segment.text}</Fragment>
        ),
      )}
    </>
  )
}

function clampAxis(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target
  return current + Math.sign(target - current) * maxDelta
}

function clampSpread(spread: number): number {
  if (!Number.isFinite(spread)) return 1
  return Math.min(Math.ceil(PAGES_PER_BOOK / 2), Math.max(1, Math.round(spread)))
}

function spreadToLeftPage(spread: number): number {
  return clampPage((clampSpread(spread) - 1) * 2 + 1)
}

function spreadToRightPage(spread: number): number {
  return clampPage(spreadToLeftPage(spread) + 1)
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

export default App
