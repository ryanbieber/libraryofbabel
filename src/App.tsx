import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Dices, HelpCircle, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ArenaViewport } from './ArenaViewport'
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

const facingDirections = [
  { label: 'north', q: 0, r: -1 },
  { label: 'north east', q: 1, r: -1 },
  { label: 'south east', q: 1, r: 0 },
  { label: 'south', q: 0, r: 1 },
  { label: 'south west', q: -1, r: 1 },
  { label: 'north west', q: -1, r: 0 },
] as const

function App() {
  const [inLibrary, setInLibrary] = useState(() => startsInsideLibrary())
  const [floor, setFloor] = useState(0)
  const [currentRoom, setCurrentRoom] = useState({ q: 0, r: 0 })
  const [facing, setFacing] = useState(defaultAddress.wall)
  const [selectedBook, setSelectedBook] = useState<BookAddress>(defaultAddress)
  const [readerOpen, setReaderOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [movementCue, setMovementCue] = useState<'idle' | 'step' | 'turn-left' | 'turn-right'>('idle')
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState(() =>
    startsInsideLibrary()
      ? 'The door seals behind you. The shelves breathe dust.'
      : 'The vagabond waits beside the tower door.',
  )
  const generatedPage = useMemo(() => generatePage({ ...selectedBook, page }), [selectedBook, page])
  const nextGeneratedPage = useMemo(
    () => generatePage({ ...selectedBook, page: clampPage(page + 1) }),
    [selectedBook, page],
  )
  const totalExponent = Math.round(possibleBooksExponent()).toLocaleString()

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!inLibrary || readerOpen || helpOpen) return

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

  function enterLibrary(answer: 'yes' | 'no') {
    setInLibrary(true)
    setMessage(
      answer === 'yes'
        ? 'The door seals behind you. The shelves breathe dust.'
        : 'The vagabond laughs. The sand gives way beneath your boots. You are inside anyway.',
    )
  }

  function moveRoom(deltaQ: number, deltaR: number) {
    const nextRoom = { q: currentRoom.q + deltaQ, r: currentRoom.r + deltaR }
    setMovementCue('step')
    setCurrentRoom(nextRoom)
    setSelectedBook((current) => ({ ...current, roomQ: nextRoom.q, roomR: nextRoom.r, wall: facing }))
    setReaderOpen(false)
    setMessage('You step into the next chamber. The room seems unchanged, except for its address.')
    window.setTimeout(() => setMovementCue('idle'), 220)
  }

  function moveByFacing(multiplier: 1 | -1) {
    const direction = facingDirections[facing]
    moveRoom(direction.q * multiplier, direction.r * multiplier)
  }

  function turn(delta: 1 | -1) {
    const nextFacing = positiveModulo(facing + delta, facingDirections.length)
    setMovementCue(delta < 0 ? 'turn-left' : 'turn-right')
    setFacing(nextFacing)
    setSelectedBook((current) =>
      nearbyBookAddress(currentRoom.q, currentRoom.r, nextFacing, current.shelf, current.book),
    )
    setMessage(`You turn to face ${facingDirections[nextFacing].label}.`)
    window.setTimeout(() => setMovementCue('idle'), 180)
  }

  function changeFloor(delta: number) {
    setFloor((current) => current + delta)
    setReaderOpen(false)
    setMessage(delta > 0 ? 'You climb. The next floor is the same.' : 'You descend. The next floor is the same.')
  }

  function openBook(address: BookAddress) {
    setSelectedBook(address)
    setPage(1)
    setReaderOpen(true)
    setMessage('The volume opens like dry leather.')
  }

  function jump() {
    const address = deterministicJump(`${floor}:${currentRoom.q}:${currentRoom.r}:${page}:${Date.now()}`)
    setCurrentRoom({ q: address.roomQ, r: address.roomR })
    setFacing(address.wall)
    openBook(address)
  }

  return (
    <main className="arena-shell">
      <section className="game-frame" aria-label="Library game viewport">
        <div
          className={
            inLibrary ? `scene scene-library movement-${movementCue}` : 'scene scene-desert'
          }
        >
          {inLibrary ? (
            <ArenaViewport
              floor={floor}
              facing={facing}
              currentRoom={currentRoom}
              selectedBook={selectedBook}
              movementCue={movementCue}
              facingLabel={facingDirections[facing].label}
              onOpenBook={openBook}
              onChangeFloor={changeFloor}
            />
          ) : (
            <DesertScene onAnswer={enterLibrary} />
          )}
        </div>

        <div className="message-bar" role="status">
          {message}
        </div>

        <div className="command-bar" aria-label="Movement and actions">
          <div className="status-box">
            <strong>{inLibrary ? `FLOOR ${floor}` : 'DESERT'}</strong>
            <span>{inLibrary ? `ROOM ${currentRoom.q},${currentRoom.r}` : 'TOWER GATE'}</span>
            <span>{inLibrary ? facingDirections[facing].label : 'OUTSIDE'}</span>
          </div>
          <div className="move-pad">
            <button type="button" disabled={!inLibrary} aria-label="Turn left" onClick={() => turn(-1)}>
              <ArrowLeft size={22} aria-hidden="true" />
            </button>
            <button type="button" disabled={!inLibrary} aria-label="Forward" onClick={() => moveByFacing(1)}>
              <ArrowUp size={22} aria-hidden="true" />
            </button>
            <button type="button" disabled={!inLibrary} aria-label="Turn right" onClick={() => turn(1)}>
              <ArrowRight size={22} aria-hidden="true" />
            </button>
            <button type="button" disabled={!inLibrary} aria-label="Back" onClick={() => moveByFacing(-1)}>
              <ArrowDown size={22} aria-hidden="true" />
            </button>
          </div>
          <div className="action-buttons">
            <button type="button" disabled={!inLibrary} onClick={() => changeFloor(1)}>
              stairs up
            </button>
            <button type="button" disabled={!inLibrary} onClick={() => changeFloor(-1)}>
              stairs down
            </button>
            <button type="button" disabled={!inLibrary} aria-label="Random volume" onClick={jump}>
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

function DesertScene({ onAnswer }: { onAnswer: (answer: 'yes' | 'no') => void }) {
  return (
    <>
      <div className="pixel-sky" />
      <div className="pixel-sun" />
      <div className="pixel-dunes back" />
      <div className="pixel-dunes front" />
      <div className="tower">
        <div className="tower-cap" />
        <div className="tower-body" />
        <div className="tower-door" />
      </div>
      <div className="vagabond" aria-hidden="true">
        <div className="vagabond-hood" />
        <div className="vagabond-body" />
        <div className="vagabond-staff" />
      </div>
      <div className="dialog-box">
        <p>“Are you sure you want to give yourself over to the library?”</p>
        <div>
          <button type="button" onClick={() => onAnswer('yes')}>
            yes
          </button>
          <button type="button" onClick={() => onAnswer('no')}>
            no
          </button>
        </div>
      </div>
    </>
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

function startsInsideLibrary(): boolean {
  return window.location.hash === '#library'
}

export default App
