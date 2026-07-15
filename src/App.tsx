import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { QuestMarkerState } from './ArenaViewport'
import { BookReader } from './components/BookReader'
import { NpcDialoguePanel } from './components/NpcDialoguePanel'
import { SplashScreen } from './components/SplashScreen'
import type { BookAddress } from './lib/library'
import { generatePage, nearbyBookAddress } from './lib/library'
import { spreadToLeftPage, spreadToRightPage } from './lib/bookSpread'
import { zoneLabel } from './lib/level'
import { isNpcReachable, npcForGallery, type LibraryNpc } from './lib/npcs'
import {
  BOOK_INTERACTION_RADIUS,
  STEP_DISTANCE,
  WALK_SPEED,
  distanceToBook,
  isBookReachable,
  movePose,
  rotatePose,
  type PlayerPose,
} from './lib/roomGeometry'
import { clearSavedGame, defaultSavedGame, readSavedGame, writeSavedGame, type SavedGameV1 } from './lib/saveGame'
import {
  resolveSignificantWordQuestSubmission,
  type WordQuestFeedback,
  type WordQuestFormValues,
  type WordQuestStatus,
} from './lib/significantWordQuest'
import './App.css'

const LazyArenaViewport = lazy(() => import('./ArenaViewport').then((module) => ({ default: module.ArenaViewport })))

type MovementCue = 'idle' | 'step' | 'turn-left' | 'turn-right'
type HoldMovement = { forward: number; strafe: number; turnSlowdown: number }

const HOLD_FORWARD_SPEED_SCALE = 0.62
const HOLD_INITIAL_STEP_SCALE = 0.16
const HOLD_ACCELERATION_PER_SECOND = 1.25
const HOLD_DECELERATION_PER_SECOND = 4.2

function App() {
  const initialSave = useRef<SavedGameV1 | null>(readSavedGame())
  const initialGame = initialSave.current ?? defaultSavedGame()
  const [playerPose, setPlayerPoseState] = useState<PlayerPose>(initialGame.pose)
  const [selectedBook, setSelectedBook] = useState<BookAddress>(initialGame.selectedBook)
  const [wordQuestStatus, setWordQuestStatus] = useState<WordQuestStatus>(initialGame.questStatus)
  const [readerOpen, setReaderOpen] = useState(false)
  const [dialogueNpc, setDialogueNpc] = useState<LibraryNpc | null>(null)
  const [wordQuestFeedback, setWordQuestFeedback] = useState<WordQuestFeedback | null>(null)
  const [splashOpen, setSplashOpen] = useState(true)
  const [hasStarted, setHasStarted] = useState(false)
  const [movementCue, setMovementCue] = useState<MovementCue>('idle')
  const [spread, setSpread] = useState(1)
  const [message, setMessage] = useState('The lamps wait above the central shaft.')
  const playerPoseRef = useRef<PlayerPose>(initialGame.pose)
  const modalOpenRef = useRef(true)
  const holdMovementRef = useRef<HoldMovement>({ forward: 0, strafe: 0, turnSlowdown: 0 })
  const holdForwardRampRef = useRef(0)
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
      holdMovementRef.current = { forward: 0, strafe: 0, turnSlowdown: 0 }
      holdForwardRampRef.current = 0
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
        const hold = holdMovementRef.current
        const target = hold.forward * (1 - hold.turnSlowdown) * HOLD_FORWARD_SPEED_SCALE
        holdForwardRampRef.current = moveToward(
          holdForwardRampRef.current,
          target,
          (target > holdForwardRampRef.current ? HOLD_ACCELERATION_PER_SECOND : HOLD_DECELERATION_PER_SECOND) * deltaSeconds,
        )
        const forward = clampAxis(holdForwardRampRef.current)
        const strafe = clampAxis(hold.strafe * HOLD_FORWARD_SPEED_SCALE)
        if (forward !== 0 || strafe !== 0) movePlayer(forward, strafe, WALK_SPEED * deltaSeconds, false)
      }
      animationFrame = window.requestAnimationFrame(tick)
    }
    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [])

  useEffect(() => () => {
    if (cueTimeout.current !== null) window.clearTimeout(cueTimeout.current)
  }, [])

  function setPlayerPose(nextPose: PlayerPose) {
    playerPoseRef.current = nextPose
    setPlayerPoseState(nextPose)
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
    setMessage(currentNpc.quest === 'significant-word' ? 'The monk offers a quest from the open book.' : 'The monk raises two ink-stained fingers.')
  }

  function startFreshJourney() {
    clearSavedGame()
    const game = defaultSavedGame()
    setPlayerPose(game.pose)
    setSelectedBook(game.selectedBook)
    setWordQuestStatus(game.questStatus)
    setWordQuestFeedback(null)
    setDialogueNpc(null)
    setReaderOpen(false)
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
    setMessage('The monk waits for floor, gallery, wall, shelf, volume, and page.')
  }

  function submitSignificantWordQuest(values: WordQuestFormValues) {
    const result = resolveSignificantWordQuestSubmission(values, wordQuestStatus)
    if (result.nextStatus !== undefined) setWordQuestStatus(result.nextStatus)
    setWordQuestFeedback(result.feedback)
    setMessage(result.message)
  }

  return (
    <main className="arena-shell">
      <section className="game-frame" aria-label="Library game viewport">
        <div className={`scene scene-library movement-${movementCue}`}>
          {hasStarted ? (
            <Suspense fallback={<div className="scene-loading">Lighting the gallery…</div>}>
              <LazyArenaViewport
                playerPose={playerPose}
                selectedBook={selectedBook}
                movementCue={movementCue}
                npc={currentNpc}
                questMarker={questMarker}
                canTalkToNpc={canTalkToNpc && dialogueNpc === null}
                onOpenBook={openBook}
                onTalkToNpc={talkToNpc}
                onLook={rotatePlayer}
                onHoldForwardStart={() => movePlayer(1, 0, STEP_DISTANCE * HOLD_INITIAL_STEP_SCALE)}
                onHoldMoveChange={(movement) => { holdMovementRef.current = movement }}
              />
            </Suspense>
          ) : <div className="scene-loading atmospheric" aria-hidden="true" />}
        </div>
        {hasStarted ? <button type="button" className="journey-menu" onClick={() => setSplashOpen(true)}>Journey</button> : null}
        <div className="message-bar" role="status">{message}</div>
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
          onSubmitSignificantWordQuest={submitSignificantWordQuest}
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

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target
  return current + Math.sign(target - current) * maxDelta
}

function questMarkerForNpc(npc: LibraryNpc | null, status: WordQuestStatus): QuestMarkerState {
  if (npc?.quest !== 'significant-word' || status === 'completed') return null
  return status === 'not-started' ? 'available' : 'active'
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

export default App
