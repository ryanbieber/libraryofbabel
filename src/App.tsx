import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { QuestMarkerState } from './ArenaViewport'
import { BookReader } from './components/BookReader'
import { NpcDialoguePanel } from './components/NpcDialoguePanel'
import { QuestLog } from './components/QuestLog'
import { SplashScreen } from './components/SplashScreen'
import { SHELF_WALLS, generatePage, nearbyBookAddress, type BookAddress, type ShelfWall } from './lib/library'
import { spreadToLeftPage, spreadToRightPage } from './lib/bookSpread'
import { zoneLabel } from './lib/level'
import { isNpcReachable, npcForGallery, type LibraryNpc } from './lib/npcs'
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
import { clearSavedGame, defaultSavedGame, readSavedGame, writeSavedGame, type SavedGameV1 } from './lib/saveGame'
import {
  resolveSignificantWordQuestSubmission,
  type WordQuestFeedback,
  type WordQuestFormValues,
  type WordQuestStatus,
} from './lib/significantWordQuest'
import { QUEST_TARGET_WORD } from './lib/quest'
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

function App() {
  const initialSave = useRef<SavedGameV1 | null>(readSavedGame())
  const initialGame = initialSave.current ?? defaultSavedGame()
  const [playerPose, setPlayerPoseState] = useState<PlayerPose>(initialGame.pose)
  const [cameraPitch, setCameraPitch] = useState(0)
  const [jumpOffset, setJumpOffset] = useState(0)
  const [selectedBook, setSelectedBook] = useState<BookAddress>(initialGame.selectedBook)
  const [wordQuestStatus, setWordQuestStatus] = useState<WordQuestStatus>(initialGame.questStatus)
  const [readerOpen, setReaderOpen] = useState(false)
  const [dialogueNpc, setDialogueNpc] = useState<LibraryNpc | null>(null)
  const [wordQuestFeedback, setWordQuestFeedback] = useState<WordQuestFeedback | null>(null)
  const [questLogMinimized, setQuestLogMinimized] = useState(false)
  const [splashOpen, setSplashOpen] = useState(true)
  const [hasStarted, setHasStarted] = useState(false)
  const [movementCue, setMovementCue] = useState<MovementCue>('idle')
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

  const leftPageNumber = spreadToLeftPage(spread)
  const rightPageNumber = spreadToRightPage(spread)
  const leftPage = useMemo(() => generatePage({ ...selectedBook, page: leftPageNumber }), [selectedBook, leftPageNumber])
  const rightPage = useMemo(() => generatePage({ ...selectedBook, page: rightPageNumber }), [selectedBook, rightPageNumber])
  const currentNpc = useMemo(() => {
    if (playerPose.zone.kind !== 'gallery') return null
    return npcForGallery(playerPose.floor, playerPose.zone.gallery)
  }, [playerPose.floor, playerPose.zone])
  const canTalkToNpc = isNpcReachable(playerPose, currentNpc)
  const questMarker = questMarkerForNpc(currentNpc, wordQuestStatus)

  useEffect(() => {
    modalOpenRef.current = readerOpen || splashOpen || dialogueNpc !== null
    if (modalOpenRef.current) {
      touchMovementRef.current = { forward: 0, strafe: 0 }
      pressedKeysRef.current.clear()
    }
  }, [readerOpen, splashOpen, dialogueNpc])

  useEffect(() => setDialogueNpc(null), [playerPose.floor, playerPose.zone])

  useEffect(() => {
    if (!hasStarted) return
    const timeout = window.setTimeout(() => {
      writeSavedGame({ version: 1, pose: playerPose, selectedBook, questStatus: wordQuestStatus })
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [hasStarted, playerPose, selectedBook, wordQuestStatus])

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
      setSelectedBook((current) => nearbyBookAddress(result.pose.floor, result.pose.zone.kind === 'gallery' ? result.pose.zone.gallery : 0, current.wall, current.shelf, current.book))
    }
    if (result.transition === 'floor') {
      setMessage(`You reach floor ${signed(result.pose.floor)}. The same procession continues.`)
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
    if (readerOpen || splashOpen || dialogueNpc !== null) return
    if (currentNpc && isNpcReachable(playerPoseRef.current, currentNpc)) {
      talkToNpc()
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
    setSelectedBook(address)
    setDialogueNpc(null)
    if (!isBookReachable(playerPoseRef.current, address)) {
      setReaderOpen(false)
      setMessage(`That volume is ${distanceToBook(playerPoseRef.current, address) > BOOK_INTERACTION_RADIUS ? 'too far away' : 'out of reach'}.`)
      return
    }
    setSpread(1)
    setReaderOpen(true)
    setMessage('The volume opens like dry leather.')
  }

  function talkToNpc() {
    if (!currentNpc || !isNpcReachable(playerPoseRef.current, currentNpc)) {
      setMessage('Move closer to the hooded monk.')
      return
    }
    setReaderOpen(false)
    setDialogueNpc(currentNpc)
    if (currentNpc.quest === 'significant-word') {
      const questMessage = wordQuestStatus === 'ready-to-complete'
        ? 'You return to the monk with the proven coordinate.'
        : wordQuestStatus === 'accepted'
          ? 'The monk waits while the search continues in your Quest Log.'
          : 'The monk offers a quest from the open book.'
      setMessage(questMessage)
    } else {
      setMessage('The monk raises two ink-stained fingers.')
    }
  }

  function startFreshJourney() {
    clearSavedGame()
    const game = defaultSavedGame()
    setPlayerPose(game.pose)
    setSelectedBook(game.selectedBook)
    setWordQuestStatus(game.questStatus)
    setWordQuestFeedback(null)
    setQuestLogMinimized(false)
    setDialogueNpc(null)
    setReaderOpen(false)
    setCameraPitchClamped(0)
    jumpVelocityRef.current = 0
    jumpOffsetRef.current = 0
    setJumpOffset(0)
    setHasStarted(true)
    setSplashOpen(false)
    initialSave.current = null
    setMessage('The door seals behind you. The galleries breathe dust.')
  }

  function continueJourney() {
    setHasStarted(true)
    setSplashOpen(false)
    setMessage(`You return to floor ${signed(playerPoseRef.current.floor)}, ${zoneLabel(playerPoseRef.current.zone)}.`)
  }

  function acceptSignificantWordQuest() {
    setWordQuestStatus((current) => current === 'not-started' ? 'accepted' : current)
    setWordQuestFeedback(null)
    setQuestLogMinimized(false)
    setDialogueNpc(null)
    setMessage('Quest accepted. The Quest Log opens with fields for floor, gallery, wall, shelf, volume, and page.')
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

  return (
    <main className="arena-shell">
      <section className={`game-frame ${readerOpen || splashOpen || dialogueNpc !== null ? 'ui-modal-open' : ''}`} aria-label="Library game viewport">
        <div className={`scene scene-library movement-${movementCue}`}>
          {hasStarted ? (
            <Suspense fallback={<div className="scene-loading">Lighting the gallery…</div>}>
              <LazyArenaViewport
                playerPose={playerPose}
                selectedBook={selectedBook}
                movementCue={movementCue}
                cameraPitch={cameraPitch}
                jumpOffset={jumpOffset}
                npc={currentNpc}
                questMarker={questMarker}
                canTalkToNpc={canTalkToNpc && dialogueNpc === null}
                onOpenBook={openBook}
                onTalkToNpc={talkToNpc}
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
            <span>{`floor ${signed(playerPose.floor)}`}</span>
            <span>WASD move. Mouse or swipe looks. Click, tap, or touch to interact. Space jumps.</span>
          </div>
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
          onCompleteSignificantWordQuest={completeSignificantWordQuest}
        />
      ) : null}
    </main>
  )
}

function blockedMessage(reason: NonNullable<ReturnType<typeof movePose>['blocked']>): string {
  if (reason === 'lightwell') return 'The low railing keeps you from the shaft.'
  if (reason === 'gate') return 'Beyond the grille, more galleries disappear into the dark.'
  if (reason === 'landing') return 'The stair continues beyond the playable floors, but the landing is barred.'
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

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

export default App
