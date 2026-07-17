import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { QuestMarkerState, SceneNpc } from './ArenaViewport'
import { BookReader } from './components/BookReader'
import { NpcDialoguePanel } from './components/NpcDialoguePanel'
import { QuestLog } from './components/QuestLog'
import { SplashScreen } from './components/SplashScreen'
import { SHELF_WALLS, addressKey, generatePage, nearbyBookAddress, type BookAddress, type ShelfWall } from './lib/library'
import { spreadToLeftPage, spreadToRightPage } from './lib/bookSpread'
import { signedLabel, zoneLabel } from './lib/level'
import { isNpcReachable, nearestNpc, npcsForGallery, wanderingNpcAtTime, type LibraryNpc } from './lib/npcs'
import {
  BOOK_INTERACTION_RADIUS,
  WALK_SPEED,
  distanceToBook,
  isBookReachable,
  movePose,
  rotatePose,
  wallNormal,
  type PlayerPose,
} from './lib/roomGeometry'
import { clearSavedGame, defaultSavedGame, readSavedGame, writeSavedGame, type SavedGameV2 } from './lib/saveGame'
import {
  resolveSignificantWordQuestSubmission,
  type WordQuestFeedback,
  type WordQuestFormValues,
  type WordQuestStatus,
} from './lib/significantWordQuest'
import { QUEST_TARGET_WORD } from './lib/quest'
import { findWord, wordFindingLabel, type WordFinding } from './lib/wordFinder'
import './App.css'

const LazyArenaViewport = lazy(() => import('./ArenaViewport').then((module) => ({ default: module.ArenaViewport })))

type MovementCue = 'idle' | 'step' | 'turn-left' | 'turn-right'
type HoldMovement = { forward: number; strafe: number }

const KEYBOARD_MOVE_SPEED_SCALE = 0.82
const TOUCH_MOVE_SPEED_SCALE = 0.68
const JUMP_START_VELOCITY = 3.2
const JUMP_GRAVITY = 9.2
const MIN_CAMERA_PITCH = -0.82
const MAX_CAMERA_PITCH = 0.72
const BOOK_PRESENTATION_DELAY_MS = 700
const JOURNEY_ARRIVAL_DURATION_MS = 5400
const NPC_MOTION_TICK_MS = 200

function App() {
  const initialSave = useRef<SavedGameV2 | null>(readSavedGame())
  const initialGame = initialSave.current ?? defaultSavedGame()
  const [playerPose, setPlayerPoseState] = useState<PlayerPose>(initialGame.pose)
  const [cameraPitch, setCameraPitch] = useState(0)
  const [jumpOffset, setJumpOffset] = useState(0)
  const [selectedBook, setSelectedBook] = useState<BookAddress>(initialGame.selectedBook)
  const [wordFinding, setWordFinding] = useState<WordFinding | null>(initialGame.wordFinding)
  const [presentedBook, setPresentedBook] = useState<BookAddress | null>(null)
  const [wordQuestStatus, setWordQuestStatus] = useState<WordQuestStatus>(initialGame.questStatus)
  const [readerOpen, setReaderOpen] = useState(false)
  const [dialogueNpc, setDialogueNpc] = useState<LibraryNpc | null>(null)
  const [wordQuestFeedback, setWordQuestFeedback] = useState<WordQuestFeedback | null>(null)
  const [wordFinderFeedback, setWordFinderFeedback] = useState<string | null>(null)
  const [wordFinderSearching, setWordFinderSearching] = useState(false)
  const [questLogMinimized, setQuestLogMinimized] = useState(false)
  const [splashOpen, setSplashOpen] = useState(true)
  const [hasStarted, setHasStarted] = useState(false)
  const [arrivalVisible, setArrivalVisible] = useState(false)
  const [movementCue, setMovementCue] = useState<MovementCue>('idle')
  const [npcMotionSeconds, setNpcMotionSeconds] = useState(0)
  const [spread, setSpread] = useState(1)
  const [message, setMessage] = useState('The lamps wait above the central shaft.')
  const playerPoseRef = useRef<PlayerPose>(initialGame.pose)
  const cameraPitchRef = useRef(0)
  const modalOpenRef = useRef(true)
  const touchMovementRef = useRef<HoldMovement>({ forward: 0, strafe: 0 })
  const pressedKeysRef = useRef<Set<string>>(new Set())
  const jumpVelocityRef = useRef(0)
  const jumpOffsetRef = useRef(0)
  const cueTimeout = useRef<number | null>(null)
  const bookPresentationTimeout = useRef<number | null>(null)
  const arrivalTimeout = useRef<number | null>(null)

  const leftPageNumber = spreadToLeftPage(spread)
  const rightPageNumber = spreadToRightPage(spread)
  const leftPage = useMemo(() => generatePage({ ...selectedBook, page: leftPageNumber }), [selectedBook, leftPageNumber])
  const rightPage = useMemo(() => generatePage({ ...selectedBook, page: rightPageNumber }), [selectedBook, rightPageNumber])
  const baseCurrentNpcs = useMemo(() => {
    if (playerPose.zone.kind !== 'gallery') return []
    return npcsForGallery(playerPose.floor, playerPose.zone.gallery)
  }, [playerPose.floor, playerPose.zone])
  const currentNpcs = useMemo(
    () => baseCurrentNpcs.map((npc) => wanderingNpcAtTime(npc, npcMotionSeconds)),
    [baseCurrentNpcs, npcMotionSeconds],
  )
  const closestNpc = nearestNpc(playerPose, currentNpcs)
  const talkableNpc = isNpcReachable(playerPose, closestNpc) ? closestNpc : null
  const npcStates = useMemo<SceneNpc[]>(() => currentNpcs.map((npc) => ({
    npc,
    questMarker: questMarkerForNpc(npc, wordQuestStatus),
  })), [currentNpcs, wordQuestStatus])

  useEffect(() => {
    modalOpenRef.current = readerOpen || presentedBook !== null || splashOpen || arrivalVisible || dialogueNpc !== null
    if (modalOpenRef.current) {
      touchMovementRef.current = { forward: 0, strafe: 0 }
      pressedKeysRef.current.clear()
    }
  }, [readerOpen, presentedBook, splashOpen, arrivalVisible, dialogueNpc])

  useEffect(() => setDialogueNpc(null), [playerPose.floor, playerPose.zone])

  useEffect(() => {
    if (!hasStarted || !baseCurrentNpcs.some((npc) => npc.wandering)) return
    const interval = window.setInterval(() => {
      setNpcMotionSeconds((seconds) => seconds + NPC_MOTION_TICK_MS / 1000)
    }, NPC_MOTION_TICK_MS)
    return () => window.clearInterval(interval)
  }, [baseCurrentNpcs, hasStarted])

  useEffect(() => {
    if (!hasStarted) return
    const timeout = window.setTimeout(() => {
      writeSavedGame({ version: 2, pose: playerPose, selectedBook, questStatus: wordQuestStatus, wordFinding })
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [hasStarted, playerPose, selectedBook, wordFinding, wordQuestStatus])

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
        if (forward !== 0 || strafe !== 0) movePlayer(forward, strafe, WALK_SPEED * KEYBOARD_MOVE_SPEED_SCALE * deltaSeconds, false)

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
      if (key === ' ') { startJump(); return }
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

  useEffect(() => () => {
    if (cueTimeout.current !== null) window.clearTimeout(cueTimeout.current)
    if (bookPresentationTimeout.current !== null) window.clearTimeout(bookPresentationTimeout.current)
    if (arrivalTimeout.current !== null) window.clearTimeout(arrivalTimeout.current)
  }, [])

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
    if (cueTimeout.current !== null) window.clearTimeout(cueTimeout.current)
    cueTimeout.current = window.setTimeout(() => setMovementCue('idle'), 220)
  }

  function movePlayer(forward: number, strafe: number, distance: number, showMessage = true) {
    const previous = playerPoseRef.current
    const result = movePose(previous, forward, strafe, distance)
    setPlayerPose(result.pose)
    if (result.pose.zone.kind === 'gallery' && (previous.zone.kind !== 'gallery' || previous.floor !== result.pose.floor || previous.zone.gallery !== result.pose.zone.gallery)) {
      const gallery = result.pose.zone.gallery
      setSelectedBook((current) => nearbyBookAddress(result.pose.floor, gallery, current.wall, current.shelf, current.book))
    }
    if (result.transition === 'floor') {
      setMessage(`You reach floor ${signedLabel(result.pose.floor)}. The same procession continues.`)
    } else if (result.transition === 'stairs') {
      setMessage('Your steps circle the stairwell above the dark.')
    } else if (result.transition) {
      setMessage(`You enter the ${zoneLabel(result.pose.zone)}.`)
    } else if (showMessage && result.blocked) {
      setMessage(blockedMessage(result.blocked))
    }
    if (showMessage) triggerCue('step')
  }

  function rotatePlayer(deltaYaw: number) {
    setPlayerPose(rotatePose(playerPoseRef.current, deltaYaw))
  }

  function lookPlayer(deltaYaw: number, deltaPitch: number) {
    rotatePlayer(deltaYaw)
    if (deltaPitch !== 0) setCameraPitchClamped(cameraPitchRef.current + deltaPitch)
  }

  function startJump() {
    if (jumpOffsetRef.current > 0 || jumpVelocityRef.current !== 0) return
    jumpVelocityRef.current = JUMP_START_VELOCITY
    setMessage('You jump.')
  }

  function interact() {
    if (readerOpen || presentedBook !== null || splashOpen || arrivalVisible || dialogueNpc !== null) return
    if (talkableNpc) {
      talkToNpc(talkableNpc)
      return
    }
    const pose = playerPoseRef.current
    if (pose.zone.kind !== 'gallery') {
      setMessage('Only dust answers here.')
      return
    }
    openBook(nearbyBookAddress(
      pose.floor,
      pose.zone.gallery,
      nearestShelfWall(pose),
      selectedBook.shelf,
      selectedBook.book,
    ))
  }

  function openBook(address: BookAddress) {
    if (bookPresentationTimeout.current !== null) {
      window.clearTimeout(bookPresentationTimeout.current)
      bookPresentationTimeout.current = null
    }
    setSelectedBook(address)
    setDialogueNpc(null)
    if (!isBookReachable(playerPoseRef.current, address)) {
      setReaderOpen(false)
      setPresentedBook(null)
      setMessage(`That volume is ${distanceToBook(playerPoseRef.current, address) > BOOK_INTERACTION_RADIUS ? 'too far away' : 'out of reach'}.`)
      return
    }
    const findingPage = wordFinding && addressKey(wordFinding.address) === addressKey(address) ? wordFinding.address.page : 1
    setSpread(Math.ceil(findingPage / 2))
    setReaderOpen(false)
    setPresentedBook(address)
    setMessage('The leather-bound volume eases out from the shelf.')
    bookPresentationTimeout.current = window.setTimeout(() => {
      setReaderOpen(true)
      setMessage('The volume opens like dry leather.')
      bookPresentationTimeout.current = null
    }, BOOK_PRESENTATION_DELAY_MS)
  }

  function closeBook() {
    if (bookPresentationTimeout.current !== null) {
      window.clearTimeout(bookPresentationTimeout.current)
      bookPresentationTimeout.current = null
    }
    setReaderOpen(false)
    setPresentedBook(null)
    setMessage('The volume closes and settles back into the shelf.')
  }

  function talkToNpc(npc: LibraryNpc | null = talkableNpc) {
    if (!npc || !isNpcReachable(playerPoseRef.current, npc)) {
      setMessage('Move closer to the monk.')
      return
    }
    setReaderOpen(false)
    setPresentedBook(null)
    setDialogueNpc(npc)
    if (npc.quest === 'significant-word') {
      const questMessage = wordQuestStatus === 'ready-to-complete'
        ? 'You return to the monk with the proven coordinate.'
        : wordQuestStatus === 'accepted'
          ? 'The monk waits while the search continues in your Quest Log.'
          : 'The monk offers a quest from the open book.'
      setMessage(questMessage)
    } else if (npc.quest === 'word-finder') {
      setWordFinderFeedback(null)
      setMessage(wordFinding ? `The indexer remembers “${wordFinding.word}”.` : 'The indexer waits for a word.')
    } else if (npc.quest === 'ambient') {
      setMessage('The passing reader answers without abandoning the search.')
    } else {
      setMessage('The monk raises two ink-stained fingers.')
    }
  }

  function startFreshJourney() {
    clearSavedGame()
    const game = defaultSavedGame()
    setPlayerPose(game.pose)
    setSelectedBook(game.selectedBook)
    setWordFinding(game.wordFinding)
    setWordQuestStatus(game.questStatus)
    setWordQuestFeedback(null)
    setWordFinderFeedback(null)
    setQuestLogMinimized(false)
    setDialogueNpc(null)
    setReaderOpen(false)
    setPresentedBook(null)
    setCameraPitchClamped(0)
    jumpVelocityRef.current = 0
    jumpOffsetRef.current = 0
    setJumpOffset(0)
    setHasStarted(true)
    setSplashOpen(false)
    setArrivalVisible(true)
    setNpcMotionSeconds(0)
    if (arrivalTimeout.current !== null) window.clearTimeout(arrivalTimeout.current)
    arrivalTimeout.current = window.setTimeout(() => {
      setArrivalVisible(false)
      arrivalTimeout.current = null
    }, JOURNEY_ARRIVAL_DURATION_MS)
    initialSave.current = null
    setMessage('The Library has been waiting for you.')
  }

  function continueJourney() {
    if (arrivalTimeout.current !== null) {
      window.clearTimeout(arrivalTimeout.current)
      arrivalTimeout.current = null
    }
    setArrivalVisible(false)
    setHasStarted(true)
    setSplashOpen(false)
    setMessage(`You return to floor ${signedLabel(playerPoseRef.current.floor)}, ${zoneLabel(playerPoseRef.current.zone)}.`)
  }

  function acceptSignificantWordQuest() {
    setWordQuestStatus((current) => current === 'not-started' ? 'accepted' : current)
    setWordQuestFeedback(null)
    setQuestLogMinimized(false)
    setDialogueNpc(null)
    setMessage('Quest accepted. The Quest Log opens with fields for floor, gallery, wall, row, book, and page.')
  }

  function submitSignificantWordQuest(values: WordQuestFormValues) {
    const result = resolveSignificantWordQuestSubmission(values, wordQuestStatus)
    if (result.nextStatus !== undefined) {
      setWordQuestStatus(result.nextStatus)
      if (result.nextStatus === 'ready-to-complete') setQuestLogMinimized(false)
    }
    setWordQuestFeedback(result.feedback)
    setMessage(result.message)
  }

  function completeSignificantWordQuest() {
    setWordQuestStatus('completed')
    setWordQuestFeedback({ tone: 'success', text: 'Quest complete. The keeper marks the coordinate into the impossible ledger.' })
    setMessage(`Quest complete: Find "${QUEST_TARGET_WORD}".`)
  }

  async function askWordFinder(rawWord: string) {
    setWordFinderSearching(true)
    setWordFinderFeedback('The indexer turns the finite leaves…')
    const result = await findWord(rawWord)
    setWordFinderSearching(false)
    if (!result.valid) {
      setWordFinderFeedback(result.message)
      setMessage(result.message)
      return
    }
    setWordFinding(result.finding)
    setWordFinderFeedback(null)
    setMessage(`The indexer directs you to ${wordFindingLabel(result.finding)}.`)
  }

  return (
    <main className="arena-shell">
      <section className={`game-frame ${readerOpen || presentedBook !== null || splashOpen || arrivalVisible || dialogueNpc !== null ? 'ui-modal-open' : ''}`} aria-label="Library game viewport">
        <div className={`scene scene-library movement-${movementCue}`}>
          {hasStarted ? (
            <Suspense fallback={<div className="scene-loading">Lighting the gallery…</div>}>
              <LazyArenaViewport
                playerPose={playerPose}
                presentedBook={presentedBook}
                movementCue={movementCue}
                cameraPitch={cameraPitch}
                jumpOffset={jumpOffset}
                npcStates={npcStates}
                talkableNpcId={dialogueNpc === null ? talkableNpc?.id ?? null : null}
                onOpenBook={openBook}
                onTalkToNpc={(npc) => talkToNpc(npc)}
                onLook={lookPlayer}
                onInteract={interact}
                onJump={startJump}
                onTouchMoveChange={(movement) => { touchMovementRef.current = movement }}
              />
            </Suspense>
          ) : <div className="scene-loading atmospheric" aria-hidden="true" />}
        </div>
        {hasStarted ? <button type="button" className="journey-menu" onClick={() => setSplashOpen(true)}>Journey</button> : null}
        <div className="message-bar" role="status">{message}</div>
        {wordQuestStatus === 'accepted' || wordQuestStatus === 'ready-to-complete' ? (
          <QuestLog
            status={wordQuestStatus}
            feedback={wordQuestFeedback}
            minimized={questLogMinimized}
            onToggleMinimized={() => setQuestLogMinimized((current) => !current)}
            onSubmit={submitSignificantWordQuest}
          />
        ) : null}
        {hasStarted ? (
          <div className="control-readout" aria-label="Current position and controls">
            <strong>{zoneLabel(playerPose.zone)}</strong>
            <span>{`floor ${signedLabel(playerPose.floor)}`}</span>
            <span>{playerPose.zone.kind === 'stair'
              ? 'W or ↑ follows the stairs. S or ↓ backtracks to the landing.'
              : 'WASD move. Mouse or swipe looks. Click, tap, or touch to interact. Space jumps.'}</span>
          </div>
        ) : null}
        {arrivalVisible ? (
          <section
            className="journey-arrival"
            aria-label="Journey introduction"
            aria-live="polite"
            onAnimationEnd={() => {
              if (arrivalTimeout.current !== null) window.clearTimeout(arrivalTimeout.current)
              arrivalTimeout.current = null
              setArrivalVisible(false)
            }}
          >
            <div className="journey-arrival-copy">
              <span className="journey-arrival-kicker">The Library of Babel</span>
              <p>Welcome to your new life.</p>
              <span className="journey-arrival-subtitle">The Library has been waiting for you.</span>
            </div>
          </section>
        ) : null}
      </section>

      {splashOpen ? (
        <SplashScreen
          hasSave={initialSave.current !== null || hasStarted}
          onContinue={continueJourney}
          onNewJourney={startFreshJourney}
        />
      ) : null}

      {readerOpen ? (
        <BookReader
          selectedBook={selectedBook}
          spread={spread}
          leftPageNumber={leftPageNumber}
          rightPageNumber={rightPageNumber}
          leftPage={leftPage}
          rightPage={rightPage}
          highlightWord={wordFinding && addressKey(selectedBook) === addressKey(wordFinding.address) ? wordFinding.word : undefined}
          onClose={closeBook}
          onSpreadChange={setSpread}
        />
      ) : null}

      {dialogueNpc ? (
        <NpcDialoguePanel
          npc={dialogueNpc}
          questStatus={wordQuestStatus}
          questFeedback={wordQuestFeedback}
          wordFinding={wordFinding}
          wordFinderFeedback={wordFinderFeedback}
          wordFinderSearching={wordFinderSearching}
          onClose={() => setDialogueNpc(null)}
          onAcceptSignificantWordQuest={acceptSignificantWordQuest}
          onCompleteSignificantWordQuest={completeSignificantWordQuest}
          onFindWord={askWordFinder}
        />
      ) : null}
    </main>
  )
}

function blockedMessage(reason: NonNullable<ReturnType<typeof movePose>['blocked']>): string {
  if (reason === 'lightwell') return 'The low railing keeps you from the shaft.'
  return 'Old stone blocks the way.'
}

function clampAxis(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

function movementFromPressedKeys(keys: Set<string>): HoldMovement {
  return {
    forward: clampAxis(Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'))),
    strafe: clampAxis(Number(keys.has('d') || keys.has('arrowright') || keys.has('e')) - Number(keys.has('a') || keys.has('arrowleft') || keys.has('q'))),
  }
}

function questMarkerForNpc(npc: LibraryNpc | null, status: WordQuestStatus): QuestMarkerState {
  if (npc?.quest === 'word-finder') return 'inquiry'
  if (npc?.quest !== 'significant-word' || status === 'completed') return null
  if (status === 'ready-to-complete') return 'complete'
  return status === 'not-started' ? 'available' : null
}

function nearestShelfWall(pose: PlayerPose): ShelfWall {
  let best: ShelfWall = SHELF_WALLS[0]
  let bestScore = Number.NEGATIVE_INFINITY
  for (const wall of SHELF_WALLS) {
    const normal = wallNormal(wall)
    const score = pose.x * normal[0] + pose.z * normal[1]
    if (score > bestScore) { best = wall; bestScore = score }
  }
  return best
}

export default App
