import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Dices, HelpCircle, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ArenaViewport } from './ArenaViewport'
import {
  cardinalDirections,
  canMove,
  levelRooms,
  nearestRoom,
  nextRoom,
  roomDoors,
  roomHasFeature,
  startingRoom,
  type DirectionIndex,
} from './lib/level'
import type { BookAddress } from './lib/library'
import {
  LINES_PER_PAGE,
  PAGES_PER_BOOK,
  SYMBOLS_PER_BOOK,
  SYMBOLS_PER_LINE,
  addressLabel,
  clampPage,
  defaultAddress,
  deterministicJump,
  generatePage,
  nearbyBookAddress,
  possibleBooksExponent,
} from './lib/library'
import './App.css'

function App() {
  const [floor, setFloor] = useState(0)
  const [currentRoom, setCurrentRoom] = useState(startingRoom)
  const [facing, setFacing] = useState<DirectionIndex>(defaultAddress.wall as DirectionIndex)
  const [selectedBook, setSelectedBook] = useState<BookAddress>(defaultAddress)
  const [readerOpen, setReaderOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [movementCue, setMovementCue] = useState<'idle' | 'step' | 'turn-left' | 'turn-right'>('idle')
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState('The door seals behind you. The shelves breathe dust.')
  const generatedPage = useMemo(() => generatePage({ ...selectedBook, page }), [selectedBook, page])
  const nextGeneratedPage = useMemo(
    () => generatePage({ ...selectedBook, page: clampPage(page + 1) }),
    [selectedBook, page],
  )
  const totalExponent = Math.round(possibleBooksExponent()).toLocaleString()
  const room = nearestRoom(currentRoom)
  const doors = useMemo(() => roomDoors(currentRoom), [currentRoom])
  const canUseStairsUp = roomHasFeature(currentRoom, 'stairs-up')
  const canUseStairsDown = roomHasFeature(currentRoom, 'stairs-down')

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (readerOpen || helpOpen) return

      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
        event.preventDefault()
        moveByFacing(1)
      }
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') {
        event.preventDefault()
        moveByFacing(-1)
      }
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
        event.preventDefault()
        turn(-1)
      }
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
        event.preventDefault()
        turn(1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  function moveByFacing(multiplier: 1 | -1) {
    if (!canMove(currentRoom, facing, multiplier)) {
      const direction = multiplier === 1 ? cardinalDirections[facing].label : oppositeDirectionLabel(facing)
      setMessage(`There is no ${direction} door from this room.`)
      return
    }

    const destination = nextRoom(currentRoom, facing, multiplier)
    setMovementCue('step')
    setCurrentRoom(destination)
    setSelectedBook((current) => ({ ...current, roomQ: destination.q, roomR: destination.r, wall: facing }))
    setReaderOpen(false)
    setMessage(`You pass through the ${multiplier === 1 ? cardinalDirections[facing].label : oppositeDirectionLabel(facing)} door into ${nearestRoom(destination).name}.`)
    window.setTimeout(() => setMovementCue('idle'), 220)
  }

  function turn(delta: 1 | -1) {
    const nextFacing = positiveModulo(facing + delta, cardinalDirections.length) as DirectionIndex
    setMovementCue(delta < 0 ? 'turn-left' : 'turn-right')
    setFacing(nextFacing)
    setSelectedBook((current) =>
      nearbyBookAddress(currentRoom.q, currentRoom.r, nextFacing, current.shelf, current.book),
    )
    setMessage(`You turn to face the ${cardinalDirections[nextFacing].label} wall.`)
    window.setTimeout(() => setMovementCue('idle'), 180)
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
    setMessage(delta > 0 ? 'You climb to the next floor. The floor plan repeats.' : 'You descend. The same floor plan waits below.')
  }

  function openBook(address: BookAddress) {
    setSelectedBook(address)
    setPage(1)
    setReaderOpen(true)
    setMessage('The volume opens like dry leather.')
  }

  function jump() {
    const address = deterministicJump(`${floor}:${currentRoom.q}:${currentRoom.r}:${page}:${Date.now()}`)
    const destination = levelRooms[Math.abs(address.roomQ + address.roomR + Date.now()) % levelRooms.length]
    const nextFacing = address.wall as DirectionIndex
    setCurrentRoom({ q: destination.q, r: destination.r })
    setFacing(nextFacing)
    openBook({ ...address, roomQ: destination.q, roomR: destination.r, wall: nextFacing })
  }

  return (
    <main className="arena-shell">
      <section className="game-frame" aria-label="Library game viewport">
        <div className={`scene scene-library movement-${movementCue}`}>
          <ArenaViewport
            floor={floor}
            facing={facing}
            currentRoom={currentRoom}
            roomName={room.name}
            doors={doors}
            selectedBook={selectedBook}
            movementCue={movementCue}
            facingLabel={cardinalDirections[facing].label}
            onOpenBook={openBook}
            onMoveForward={() => moveByFacing(1)}
            onMoveBack={() => moveByFacing(-1)}
            onTurnLeft={() => turn(-1)}
            onTurnRight={() => turn(1)}
          />
        </div>

        <div className="message-bar" role="status">
          {message}
        </div>

        <div className="command-bar" aria-label="Movement and actions">
          <div className="status-box">
            <strong>{`FLOOR ${floor}`}</strong>
            <span>{`ROOM ${currentRoom.q},${currentRoom.r}`}</span>
            <span>{cardinalDirections[facing].label}</span>
          </div>
          <div className="move-pad">
            <button type="button" aria-label="Turn left" onClick={() => turn(-1)}>
              <ArrowLeft size={22} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Forward" onClick={() => moveByFacing(1)}>
              <ArrowUp size={22} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Turn right" onClick={() => turn(1)}>
              <ArrowRight size={22} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Back" onClick={() => moveByFacing(-1)}>
              <ArrowDown size={22} aria-hidden="true" />
            </button>
          </div>
          <div className="action-buttons">
            <button type="button" disabled={!canUseStairsUp} onClick={() => changeFloor(1)}>
              stairs up
            </button>
            <button type="button" disabled={!canUseStairsDown} onClick={() => changeFloor(-1)}>
              stairs down
            </button>
            <button type="button" aria-label="Random volume" onClick={jump}>
              <Dices size={21} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Open explanation" onClick={() => setHelpOpen(true)}>
              <HelpCircle size={21} aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {readerOpen ? (
        <BookReader
          selectedBook={selectedBook}
          floor={floor}
          page={page}
          leftPage={generatedPage}
          rightPage={nextGeneratedPage}
          onClose={() => setReaderOpen(false)}
          onPageChange={setPage}
        />
      ) : null}

      {helpOpen ? (
        <HelpPanel totalExponent={totalExponent} onClose={() => setHelpOpen(false)} />
      ) : null}
    </main>
  )
}

function BookReader({
  selectedBook,
  floor,
  page,
  leftPage,
  rightPage,
  onClose,
  onPageChange,
}: {
  selectedBook: BookAddress
  floor: number
  page: number
  leftPage: string[]
  rightPage: string[]
  onClose: () => void
  onPageChange: (page: number | ((current: number) => number)) => void
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
              <h2>page {page}</h2>
              <pre>{leftPage.join('\n')}</pre>
            </article>
            <article className="book-page right">
              <span>floor {floor} / {addressLabel(selectedBook)}</span>
              <h2>page {clampPage(page + 1)}</h2>
              <pre>{rightPage.join('\n')}</pre>
            </article>
          </div>
        </div>
        <div className="reader-actions">
          <button type="button" onClick={() => onPageChange((current) => clampPage(current - 2))}>
            back
          </button>
          <label>
            page
            <input
              value={page}
              aria-label="Page number"
              inputMode="numeric"
              onChange={(event) => onPageChange(clampPage(Number(event.target.value)))}
            />
          </label>
          <button type="button" onClick={() => onPageChange((current) => clampPage(current + 2))}>
            forward
          </button>
        </div>
      </div>
    </section>
  )
}

function HelpPanel({
  totalExponent,
  onClose,
}: {
  totalExponent: string
  onClose: () => void
}) {
  return (
    <section className="help-panel" aria-label="Detailed explanation">
      <div>
        <button type="button" className="close-reader" aria-label="Close explanation" onClick={onClose}>
          <X size={22} aria-hidden="true" />
        </button>
        <h2>The tower repeats forever</h2>
        <p>
          Every floor has the same shape: stairs, walls, shelves, and volumes. Only the address
          changes as you move.
        </p>
        <p>
          Each volume has {PAGES_PER_BOOK} pages, {LINES_PER_PAGE} lines per page, and{' '}
          {SYMBOLS_PER_LINE} symbols per line. With {SYMBOLS_PER_BOOK.toLocaleString()} slots and
          25 symbols, there are roughly 10^{totalExponent} possible books.
        </p>
        <p>
          The app does not store the library. It generates each page from the chosen address, so the
          same shelf and volume always opens to the same text.
        </p>
      </div>
    </section>
  )
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo
}

function oppositeDirectionLabel(facing: DirectionIndex): string {
  return cardinalDirections[positiveModulo(facing + 2, cardinalDirections.length) as DirectionIndex].label
}

export default App
