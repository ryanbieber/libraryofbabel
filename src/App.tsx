import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Text } from '@react-three/drei'
import {
  ChevronLeft,
  ChevronRight,
  Dices,
  DoorOpen,
  Footprints,
  MapPin,
  X,
} from 'lucide-react'
import { Component, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Vector3 } from 'three'
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

const roomOffsets = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
] as const

const roomDirections = [
  { label: 'north', q: 0, r: -1 },
  { label: 'north east', q: 1, r: -1 },
  { label: 'south east', q: 1, r: 0 },
  { label: 'south', q: 0, r: 1 },
  { label: 'south west', q: -1, r: 1 },
  { label: 'north west', q: -1, r: 0 },
] as const

function App() {
  const [currentRoom, setCurrentRoom] = useState({ q: defaultAddress.roomQ, r: defaultAddress.roomR })
  const [selectedBook, setSelectedBook] = useState<BookAddress>(defaultAddress)
  const [readerOpen, setReaderOpen] = useState(false)
  const [splashOpen, setSplashOpen] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [webglAvailable] = useState(() => canUseWebGL())
  const generatedPage = useMemo(() => generatePage({ ...selectedBook, page }), [selectedBook, page])
  const nextGeneratedPage = useMemo(
    () => generatePage({ ...selectedBook, page: clampPage(page + 1) }),
    [selectedBook, page],
  )
  const totalExponent = Math.round(possibleBooksExponent()).toLocaleString()
  const currentWorld = axialToWorld(currentRoom.q, currentRoom.r)

  function openBook(address: BookAddress) {
    setSelectedBook(address)
    setCurrentRoom({ q: address.roomQ, r: address.roomR })
    setPage(1)
    setReaderOpen(true)
  }

  function moveRoom(deltaQ: number, deltaR: number) {
    const nextRoom = { q: currentRoom.q + deltaQ, r: currentRoom.r + deltaR }
    setCurrentRoom(nextRoom)
    setSelectedBook((current) => ({ ...current, roomQ: nextRoom.q, roomR: nextRoom.r }))
    setReaderOpen(false)
  }

  function jump() {
    openBook(deterministicJump(`${selectedBook.roomQ}:${selectedBook.roomR}:${page}:${Date.now()}`))
  }

  return (
    <main className="app-shell">
      <section className="viewport" aria-label="3D library browser">
        {webglAvailable ? (
          <WebGlBoundary
            fallback={
              <FlatLibrary
                currentRoom={currentRoom}
                selectedBook={selectedBook}
                onSelectBook={openBook}
              />
            }
          >
            <Canvas camera={{ position: [0, 2.05, 5.8], fov: 58 }} shadows>
              <color attach="background" args={['#11100d']} />
              <fog attach="fog" args={['#11100d', 9, 38]} />
              <ambientLight intensity={0.58} />
              <directionalLight position={[6, 10, 5]} intensity={1.8} castShadow />
              <pointLight
                position={[currentWorld.x, 3, currentWorld.z]}
                color="#f2c86b"
                intensity={7}
                distance={13}
              />
              <CameraRig currentRoom={currentRoom} />
              <LibraryWorld
                currentRoom={currentRoom}
                selectedBook={selectedBook}
                onSelectBook={openBook}
              />
            </Canvas>
          </WebGlBoundary>
        ) : (
          <FlatLibrary
            currentRoom={currentRoom}
            selectedBook={selectedBook}
            onSelectBook={openBook}
          />
        )}
      </section>

      <button
        type="button"
        className="help-button"
        aria-label="Open explanation"
        onClick={() => setHelpOpen(true)}
      >
        ?
      </button>

      <section className="control-panel" aria-label="Library controls">
        <div className="location-row">
          <MapPin size={18} aria-hidden="true" />
          <span>{currentRoom.q},{currentRoom.r}</span>
        </div>

        <div className="room-controls" aria-label="Move between rooms">
          {roomDirections.map((direction) => (
            <button
              type="button"
              key={direction.label}
              onClick={() => moveRoom(direction.q, direction.r)}
            >
              <DoorOpen size={16} aria-hidden="true" />
              {direction.label}
            </button>
          ))}
        </div>

        <button type="button" className="primary-action" onClick={jump}>
          <Dices size={18} aria-hidden="true" />
          jump
        </button>
      </section>

      <section className="shelf-panel" aria-label="Bookshelf volumes">
        <div className="panel-heading">
          <span className="panel-label">
            <Footprints size={17} aria-hidden="true" />
            wall {selectedBook.wall + 1}
          </span>
          <strong>{addressLabel(selectedBook)}</strong>
        </div>
        <div className="shelf-grid">
          {Array.from({ length: 5 }, (_, shelf) => (
            <div className="shelf-row" key={shelf}>
              <span>shelf {shelf + 1}</span>
              <div>
                {Array.from({ length: 18 }, (_, book) => {
                  const address = nearbyBookAddress(currentRoom.q, currentRoom.r, selectedBook.wall, shelf, book)
                  const isSelected = addressLabel(address) === addressLabel(selectedBook)
                  return (
                    <button
                      type="button"
                      className={isSelected ? 'volume-button selected' : 'volume-button'}
                      key={`${shelf}:${book}`}
                      aria-label={`Open ${addressLabel(address)}`}
                      onClick={() => openBook(address)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="wall-controls" aria-label="Choose wall">
          {Array.from({ length: 6 }, (_, wall) => (
            <button
              type="button"
              className={wall === selectedBook.wall ? 'selected' : ''}
              key={wall}
              onClick={() =>
                setSelectedBook((current) => nearbyBookAddress(currentRoom.q, currentRoom.r, wall, current.shelf, current.book))
              }
            >
              wall {wall + 1}
            </button>
          ))}
        </div>
      </section>

      {readerOpen ? (
        <BookReader
          selectedBook={selectedBook}
          page={page}
          leftPage={generatedPage}
          rightPage={nextGeneratedPage}
          onClose={() => setReaderOpen(false)}
          onPageChange={setPage}
        />
      ) : null}

      {splashOpen ? <SplashScreen onClose={() => setSplashOpen(false)} /> : null}
      {helpOpen ? (
        <HelpPanel totalExponent={totalExponent} onClose={() => setHelpOpen(false)} />
      ) : null}
    </main>
  )
}

function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function SplashScreen({ onClose }: { onClose: () => void }) {
  return (
    <section className="splash-screen" aria-label="Library introduction">
      <div className="splash-card">
        <p className="kicker">Library of Babel</p>
        <h1>Every possible book is somewhere in the dark.</h1>
        <p>
          Step from room to room, choose a wall, pull a volume from the shelf, and open it. Each
          address creates a fixed book from a space too large to picture.
        </p>
        <button type="button" onClick={onClose}>
          enter the library
        </button>
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
        <h2>What you are walking through</h2>
        <p>
          The rooms are a way to touch the scale of a complete combinatorial library. A book here
          has {PAGES_PER_BOOK} pages, {LINES_PER_PAGE} lines per page, and {SYMBOLS_PER_LINE}{' '}
          symbols per line.
        </p>
        <p>
          With {SYMBOLS_PER_BOOK.toLocaleString()} symbol slots and 25 possible symbols, the number
          of possible volumes is roughly 10^{totalExponent}. The app does not store those books. It
          generates each page deterministically from the room, wall, shelf, volume, and page number.
        </p>
        <p>
          Move by doors, face a wall, open volumes, and turn pages. The point is not to find a
          useful book quickly. It is to feel how impossible “everything possible” becomes.
        </p>
      </div>
    </section>
  )
}

class WebGlBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function FlatLibrary({
  currentRoom,
  selectedBook,
  onSelectBook,
}: {
  currentRoom: { q: number; r: number }
  selectedBook: BookAddress
  onSelectBook: (address: BookAddress) => void
}) {
  return (
    <div className="flat-library" aria-label="2D library fallback">
      {roomOffsets.map(([q, r]) => (
        <div className="flat-room" key={`${q}:${r}`}>
          {Array.from({ length: 6 }, (_, wall) => (
            <div className="flat-wall" key={wall}>
              {Array.from({ length: 18 }, (_, book) => {
                const address = nearbyBookAddress(currentRoom.q + q, currentRoom.r + r, wall, 1, book)
                const isSelected = addressLabel(address) === addressLabel(selectedBook)
                return (
                  <button
                    type="button"
                    className={isSelected ? 'flat-book selected' : 'flat-book'}
                    key={`${wall}:${book}`}
                    aria-label={addressLabel(address)}
                    onClick={() => onSelectBook(address)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function CameraRig({ currentRoom }: { currentRoom: { q: number; r: number } }) {
  const { camera } = useThree()
  const roomCenter = axialToWorld(currentRoom.q, currentRoom.r)
  const desiredPosition = useMemo(
    () => new Vector3(roomCenter.x, 2.05, roomCenter.z + 5.8),
    [roomCenter.x, roomCenter.z],
  )
  const lookAtTarget = useMemo(
    () => new Vector3(roomCenter.x, 1.45, roomCenter.z - 0.25),
    [roomCenter.x, roomCenter.z],
  )

  useFrame(() => {
    camera.position.lerp(desiredPosition, 0.075)
    camera.lookAt(lookAtTarget)
  })

  return null
}

function LibraryWorld({
  currentRoom,
  selectedBook,
  onSelectBook,
}: {
  currentRoom: { q: number; r: number }
  selectedBook: BookAddress
  onSelectBook: (address: BookAddress) => void
}) {
  return (
    <group>
      {roomOffsets.map(([q, r]) => (
        <HexRoom
          key={`${q}:${r}`}
          q={currentRoom.q + q}
          r={currentRoom.r + r}
          isCurrent={q === 0 && r === 0}
          selectedBook={selectedBook}
          onSelectBook={onSelectBook}
        />
      ))}
      <Text
        position={[axialToWorld(currentRoom.q, currentRoom.r).x, 4.2, axialToWorld(currentRoom.q, currentRoom.r).z - 2.6]}
        fontSize={0.42}
        color="#f6e2a7"
        anchorX="center"
      >
        click any spine
      </Text>
    </group>
  )
}

function HexRoom({
  q,
  r,
  isCurrent,
  selectedBook,
  onSelectBook,
}: {
  q: number
  r: number
  isCurrent: boolean
  selectedBook: BookAddress
  onSelectBook: (address: BookAddress) => void
}) {
  const { x: centerX, z: centerZ } = axialToWorld(q, r)

  return (
    <group position={[centerX, 0, centerZ]}>
      <mesh receiveShadow rotation={[Math.PI / 2, 0, Math.PI / 6]} position={[0, -0.05, 0]}>
        <cylinderGeometry args={[3.1, 3.1, 0.12, 6]} />
        <meshStandardMaterial color={isCurrent ? '#332717' : '#1f1b14'} roughness={0.72} metalness={0.05} />
      </mesh>
      <mesh position={[0, 2.55, 0]} rotation={[Math.PI / 2, 0, Math.PI / 6]}>
        <cylinderGeometry args={[3.16, 3.16, 0.1, 6]} />
        <meshStandardMaterial color="#1e1a14" roughness={0.9} />
      </mesh>
      {Array.from({ length: 6 }, (_, wall) => (
        <BookWall
          key={wall}
          q={q}
          r={r}
          wall={wall}
          selectedBook={selectedBook}
          onSelectBook={onSelectBook}
        />
      ))}
    </group>
  )
}

function axialToWorld(q: number, r: number): { x: number; z: number } {
  return {
    x: (q + r / 2) * 7.2,
    z: r * 6.2,
  }
}

function BookWall({
  q,
  r,
  wall,
  selectedBook,
  onSelectBook,
}: {
  q: number
  r: number
  wall: number
  selectedBook: BookAddress
  onSelectBook: (address: BookAddress) => void
}) {
  const angle = (wall / 6) * Math.PI * 2
  const radius = 2.75
  const x = Math.sin(angle) * radius
  const z = Math.cos(angle) * radius

  return (
    <group position={[x, 1.15, z]} rotation={[0, angle, 0]}>
      <mesh position={[0, 0, -0.08]} castShadow>
        <boxGeometry args={[2.45, 2.35, 0.22]} />
        <meshStandardMaterial color="#342819" roughness={0.76} />
      </mesh>
      {Array.from({ length: 5 }, (_, shelf) =>
        Array.from({ length: 18 }, (_, book) => {
          const address = nearbyBookAddress(q, r, wall, shelf, book)
          const isSelected = addressLabel(address) === addressLabel(selectedBook)
          const hue = (book * 17 + shelf * 31 + wall * 43) % 360
          return (
            <mesh
              key={`${shelf}:${book}`}
              position={[-1.08 + book * 0.127, -0.92 + shelf * 0.45, 0.08]}
              scale={[0.85, 0.86 + ((book + shelf) % 3) * 0.06, 1]}
              castShadow
              onClick={(event) => {
                event.stopPropagation()
                onSelectBook(address)
              }}
            >
              <boxGeometry args={[0.09, 0.36, 0.2]} />
              <meshStandardMaterial
                color={isSelected ? '#f3d06d' : `hsl(${hue}, 42%, 38%)`}
                emissive={isSelected ? '#6d4a10' : '#000000'}
                emissiveIntensity={isSelected ? 0.35 : 0}
                roughness={0.6}
              />
              {isSelected ? (
                <Html center distanceFactor={8} position={[0, 0.42, 0.15]} className="book-tag">
                  open
                </Html>
              ) : null}
            </mesh>
          )
        }),
      )}
    </group>
  )
}

function BookReader({
  selectedBook,
  page,
  leftPage,
  rightPage,
  onClose,
  onPageChange,
}: {
  selectedBook: BookAddress
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
              <span>{addressLabel(selectedBook)}</span>
              <h2>page {page}</h2>
              <pre>{leftPage.join('\n')}</pre>
            </article>
            <article className="book-page right">
              <span>{addressLabel({ ...selectedBook, book: selectedBook.book })}</span>
              <h2>page {clampPage(page + 1)}</h2>
              <pre>{rightPage.join('\n')}</pre>
            </article>
          </div>
        </div>
        <div className="reader-actions">
          <button
            type="button"
            onClick={() => onPageChange((current) => clampPage(current - 2))}
          >
            <ChevronLeft size={20} aria-hidden="true" />
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
          <button
            type="button"
            onClick={() => onPageChange((current) => clampPage(current + 2))}
          >
            forward
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}

export default App
