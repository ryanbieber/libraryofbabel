import { X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArenaViewport, type QuestMarkerState } from './ArenaViewport'
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
  BOOKS_PER_SHELF,
  clampPage,
  defaultAddress,
  generatePage,
  nearbyBookAddress,
  PAGES_PER_BOOK,
  SHELVES_PER_WALL,
} from './lib/library'
import {
  QUEST_TARGET_WORD,
  pageContainsWord,
  targetWordOdds,
  type SignificantWordSubmission,
} from './lib/quest'
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
import { highlightPage, type HighlightSegment } from './lib/words'
import './App.css'

type MovementCue = 'idle' | 'step' | 'turn-left' | 'turn-right'

type HoldMovement = {
  forward: number
  strafe: number
  turnSlowdown: number
}

type WordQuestStatus = 'not-started' | 'accepted' | 'completed'

type WordQuestFeedback = {
  tone: 'success' | 'error'
  text: string
}

type WordQuestFormValues = {
  room: string
  wall: string
  shelf: string
  volume: string
  page: string
}

type PageTurnDirection = 'forward' | 'back' | null

const HOLD_FORWARD_SPEED_SCALE = 0.62
const HOLD_INITIAL_STEP_SCALE = 0.16
const HOLD_ACCELERATION_PER_SECOND = 1.25
const HOLD_DECELERATION_PER_SECOND = 4.2
const significantWordOdds = targetWordOdds(QUEST_TARGET_WORD)

function App() {
  const [floor, setFloor] = useState(0)
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
  const questMarker = questMarkerForNpc(currentNpc, wordQuestStatus)
  const canUseStairsUp = roomHasFeature(currentRoom, 'stairs-up')
  const canUseStairsDown = roomHasFeature(currentRoom, 'stairs-down')
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
    if (wordQuestStatus === 'not-started') {
      const text = 'Accept the monk quest before testing coordinates.'
      setWordQuestFeedback({ tone: 'error', text })
      setMessage(text)
      return
    }

    const result = parseSignificantWordSubmission(values)
    if (!result.valid) {
      setWordQuestFeedback({ tone: 'error', text: result.message })
      setMessage(result.message)
      return
    }

    const page = generatePage(result.submission)
    if (pageContainsWord(page, QUEST_TARGET_WORD)) {
      const location = `room ${result.display.room}, wall ${result.display.wall}, shelf ${result.display.shelf}, volume ${result.display.volume}, page ${result.display.page}`
      const text = `At last, a coordinate instead of a sermon: ${location}. The word is there. Bring your patience back for the next quest.`
      setWordQuestStatus('completed')
      setWordQuestFeedback({ tone: 'success', text })
      setMessage('The monk accepts the book coordinates and prepares the next quest.')
      return
    }

    const text = `No ${QUEST_TARGET_WORD} on that page. A confident heretic is still a heretic.`
    setWordQuestFeedback({ tone: 'error', text })
    setMessage(text)
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

function SplashScreen({ onStart }: { onStart: () => void }) {
  return (
    <section className="splash-screen" aria-label="Start screen">
      <div className="splash-panel">
        <p className="splash-kicker">An homage to Borges</p>
        <h1>The Library of Babel</h1>
        <p className="splash-lede">
          In Jorge Luis Borges's 1941 story, the universe is imagined as an endless library: every book
          that can be written, every truth, every lie, every biography, and every nonsense page, all
          shelved somewhere in the dark.
        </p>
        <p>
          This app turns that impossible premise into a place you can walk through: rooms, walls,
          shelves, volumes, and deterministic pages. It is not trying to solve the library. It is here to
          let you feel the absurd scale of a system that contains everything and almost no meaning.
        </p>
        <p className="splash-author">
          Borges was an Argentine writer whose fiction often treated infinity, labyrinths, language, and
          reality as traps disguised as ideas.
        </p>
        <p className="splash-controls">
          Hold to walk, drag to look, click nearby books and doors, press E at stairs.
        </p>
        <button type="button" onClick={onStart}>
          Enter Library
        </button>
      </div>
    </section>
  )
}

export function BookReader({
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
  onSpreadChange: (spread: number) => void
}) {
  const [turnDirection, setTurnDirection] = useState<PageTurnDirection>(null)
  const turnTimeoutRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (turnTimeoutRef.current !== null) {
        window.clearTimeout(turnTimeoutRef.current)
      }
    },
    [],
  )

  function requestSpread(nextSpreadValue: number) {
    const nextSpread = clampSpread(nextSpreadValue)
    if (nextSpread === spread) return

    setTurnDirection(nextSpread > spread ? 'forward' : 'back')
    onSpreadChange(nextSpread)
    if (turnTimeoutRef.current !== null) {
      window.clearTimeout(turnTimeoutRef.current)
    }
    turnTimeoutRef.current = window.setTimeout(() => setTurnDirection(null), 420)
  }

  const spreadClassName = ['book-spread', turnDirection ? `turn-${turnDirection}` : ''].join(' ')

  return (
    <section className="book-reader" aria-label="Open book reader">
      <div className="book-shell">
        <button type="button" className="close-reader" aria-label="Close book" onClick={onClose}>
          <X size={22} aria-hidden="true" />
        </button>
        <div className="book-cover">
          <div className={spreadClassName}>
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
          <button type="button" onClick={() => requestSpread(spread - 1)}>
            back
          </button>
          <label>
            spread
            <input
              value={spread}
              aria-label="Spread number"
              inputMode="numeric"
              onChange={(event) => requestSpread(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={() => requestSpread(spread + 1)}>
            forward
          </button>
        </div>
      </div>
    </section>
  )
}

function NpcDialoguePanel({
  npc,
  questStatus,
  questFeedback,
  onClose,
  onAcceptSignificantWordQuest,
  onSubmitSignificantWordQuest,
}: {
  npc: LibraryNpc
  questStatus: WordQuestStatus
  questFeedback: WordQuestFeedback | null
  onClose: () => void
  onAcceptSignificantWordQuest: () => void
  onSubmitSignificantWordQuest: (values: WordQuestFormValues) => void
}) {
  const [formValues, setFormValues] = useState<WordQuestFormValues>({
    room: '',
    wall: '',
    shelf: '',
    volume: '',
    page: '',
  })
  const isSignificantWordQuest = npc.quest === 'significant-word'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmitSignificantWordQuest(formValues)
  }

  return (
    <section className="npc-dialogue" aria-label="Monk dialogue">
      <div className="npc-dialogue-panel">
        <button type="button" className="close-reader" aria-label="Close monk dialogue" onClick={onClose}>
          <X size={22} aria-hidden="true" />
        </button>
        <p className="splash-kicker">{npcQuestKicker(npc.quest)}</p>
        <h2>{npc.name}</h2>
        <div className="npc-dialogue-lines">
          {npc.dialogue.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {isSignificantWordQuest ? (
            <>
              <p>
                A specific five-letter word has about a {formatPercent(significantWordOdds.bookChance)} chance in a
                book, roughly 1 in {formatWhole(significantWordOdds.oneInBooks)} books. A single page is roughly 1 in{' '}
                {formatWhole(significantWordOdds.oneInPages)}.
              </p>
              {questStatus === 'completed' ? (
                <p>The coordinate is accepted. The next quest can begin when the stacks stop laughing.</p>
              ) : null}
            </>
          ) : null}
        </div>
        {isSignificantWordQuest && questStatus === 'not-started' ? (
          <div className="quest-offer">
            <button type="button" onClick={onAcceptSignificantWordQuest}>
              accept quest
            </button>
          </div>
        ) : null}
        {isSignificantWordQuest && questStatus !== 'not-started' ? (
          <div className="quest-ledger" aria-label="Quest address book">
            <form className="quest-form" aria-label="Submit book coordinates" onSubmit={handleSubmit}>
              <label>
                room
                <input
                  value={formValues.room}
                  aria-label="Quest room"
                  placeholder="0,0"
                  onChange={(event) => setFormValues((current) => ({ ...current, room: event.target.value }))}
                />
              </label>
              <label>
                wall
                <input
                  value={formValues.wall}
                  aria-label="Quest wall"
                  placeholder="north"
                  onChange={(event) => setFormValues((current) => ({ ...current, wall: event.target.value }))}
                />
              </label>
              <label>
                shelf
                <input
                  value={formValues.shelf}
                  aria-label="Quest shelf"
                  inputMode="numeric"
                  placeholder="1"
                  onChange={(event) => setFormValues((current) => ({ ...current, shelf: event.target.value }))}
                />
              </label>
              <label>
                volume
                <input
                  value={formValues.volume}
                  aria-label="Quest volume"
                  inputMode="numeric"
                  placeholder="1"
                  onChange={(event) => setFormValues((current) => ({ ...current, volume: event.target.value }))}
                />
              </label>
              <label>
                page
                <input
                  value={formValues.page}
                  aria-label="Quest page"
                  inputMode="numeric"
                  placeholder="1"
                  onChange={(event) => setFormValues((current) => ({ ...current, page: event.target.value }))}
                />
              </label>
              <button type="submit">test page</button>
            </form>
          </div>
        ) : null}
        {isSignificantWordQuest && questFeedback ? (
          <p className={`quest-feedback ${questFeedback.tone}`} role="status">
            {questFeedback.text}
          </p>
        ) : null}
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

function npcQuestKicker(quest: LibraryNpc['quest']): string {
  if (quest === 'significant-word') return 'Significant word'
  return quest === 'messiah' ? 'Man of the Book' : 'Crimson rumor'
}

function questMarkerForNpc(npc: LibraryNpc | null, status: WordQuestStatus): QuestMarkerState {
  if (npc?.quest !== 'significant-word' || status === 'completed') return null
  return status === 'not-started' ? 'available' : 'active'
}

function parseSignificantWordSubmission(values: WordQuestFormValues): {
  valid: true
  submission: SignificantWordSubmission
  display: { room: string; wall: string; shelf: number; volume: number; page: number }
} | {
  valid: false
  message: string
} {
  const room = parseRoom(values.room)
  const wall = parseWall(values.wall)
  const shelf = parseInteger(values.shelf)
  const volume = parseInteger(values.volume)
  const page = parseInteger(values.page)

  if (room === null) {
    return { valid: false, message: 'Room must be two coordinates like 0,0 or -2,1.' }
  }
  if (wall === null) {
    return { valid: false, message: 'Choose a wall: north, east, south, west, or 1-4.' }
  }
  if (shelf === null || shelf < 1 || shelf > SHELVES_PER_WALL) {
    return { valid: false, message: `Shelf must be 1-${SHELVES_PER_WALL}.` }
  }
  if (volume === null || volume < 1 || volume > BOOKS_PER_SHELF) {
    return { valid: false, message: `Volume must be 1-${BOOKS_PER_SHELF}.` }
  }
  if (page === null || page < 1 || page > PAGES_PER_BOOK) {
    return { valid: false, message: `Page must be 1-${PAGES_PER_BOOK}.` }
  }

  return {
    valid: true,
    submission: {
      roomQ: room.q,
      roomR: room.r,
      wall,
      shelf: shelf - 1,
      book: volume - 1,
      page,
    },
    display: {
      room: `${room.q},${room.r}`,
      wall: cardinalDirections[wall].label,
      shelf,
      volume,
      page,
    },
  }
}

function parseRoom(value: string): { q: number; r: number } | null {
  const match = value.trim().match(/^(-?\d+)\s*,\s*(-?\d+)$/)
  if (!match) return null
  return { q: Number(match[1]), r: Number(match[2]) }
}

function parseWall(value: string): DirectionIndex | null {
  const clean = value.trim().toLowerCase()
  const numeric = parseInteger(clean)
  if (numeric !== null && numeric >= 1 && numeric <= cardinalDirections.length) {
    return (numeric - 1) as DirectionIndex
  }

  const index = cardinalDirections.findIndex((direction) => direction.label === clean || direction.shortLabel.toLowerCase() === clean)
  return index === -1 ? null : index as DirectionIndex
}

function parseInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  return Number(value)
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatWhole(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

export default App
