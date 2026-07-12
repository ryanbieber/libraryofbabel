import { Canvas } from '@react-three/fiber'
import { Html, OrbitControls, Text } from '@react-three/drei'
import { BookOpen, ChevronLeft, ChevronRight, Dices, MapPin, Search } from 'lucide-react'
import { Component, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { BookAddress } from './lib/library'
import {
  ALPHABET,
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
  sequenceOdds,
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

function App() {
  const [selectedBook, setSelectedBook] = useState<BookAddress>(defaultAddress)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('babel')
  const [webglAvailable] = useState(() => canUseWebGL())
  const generatedPage = useMemo(() => generatePage({ ...selectedBook, page }), [selectedBook, page])
  const odds = useMemo(() => sequenceOdds(query), [query])
  const totalExponent = Math.round(possibleBooksExponent()).toLocaleString()

  function openBook(address: BookAddress) {
    setSelectedBook(address)
    setPage(1)
  }

  function jump() {
    openBook(deterministicJump(`${query}:${selectedBook.roomQ}:${selectedBook.roomR}:${page}:${Date.now()}`))
  }

  return (
    <main className="app-shell">
      <section className="viewport" aria-label="3D library browser">
        {webglAvailable ? (
          <WebGlBoundary fallback={<FlatLibrary selectedBook={selectedBook} onSelectBook={openBook} />}>
            <Canvas camera={{ position: [6, 6, 9], fov: 48 }} shadows>
              <color attach="background" args={['#11100d']} />
              <fog attach="fog" args={['#11100d', 12, 34]} />
              <ambientLight intensity={0.58} />
              <directionalLight position={[6, 10, 5]} intensity={1.8} castShadow />
              <pointLight position={[0, 3, 0]} color="#f2c86b" intensity={6} distance={12} />
              <LibraryWorld selectedBook={selectedBook} onSelectBook={openBook} />
              <OrbitControls
                enableDamping
                dampingFactor={0.08}
                maxDistance={19}
                minDistance={4}
                maxPolarAngle={Math.PI / 2.08}
                target={[0, 1.5, 0]}
              />
            </Canvas>
          </WebGlBoundary>
        ) : (
          <FlatLibrary selectedBook={selectedBook} onSelectBook={openBook} />
        )}
      </section>

      <aside className="title-panel">
        <p className="kicker">public proof of concept</p>
        <h1>Library of Babel</h1>
        <p>
          Every volume here is addressed, generated on demand, and bound to the same impossible
          format: {PAGES_PER_BOOK} pages, {LINES_PER_PAGE} lines per page, {SYMBOLS_PER_LINE}{' '}
          symbols per line.
        </p>
      </aside>

      <section className="control-panel" aria-label="Library controls">
        <div className="location-row">
          <MapPin size={18} aria-hidden="true" />
          <span>{addressLabel(selectedBook)}</span>
        </div>

        <div className="stats-grid">
          <Metric label="symbols per book" value={SYMBOLS_PER_BOOK.toLocaleString()} />
          <Metric label="possible books" value={`10^${totalExponent}`} />
        </div>

        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search phrase"
            placeholder={`use only: ${ALPHABET}`}
          />
        </label>

        <div className="odds-card">
          <span>phrase odds</span>
          <strong>{odds.oneInLabel}</strong>
          <small>{odds.clean.length} valid symbols measured against one complete volume</small>
        </div>

        <button type="button" className="primary-action" onClick={jump}>
          <Dices size={18} aria-hidden="true" />
          jump to an addressed volume
        </button>
      </section>

      <section className="reader-panel" aria-label="Selected book page">
        <header>
          <div>
            <span className="panel-label">
              <BookOpen size={17} aria-hidden="true" />
              selected volume
            </span>
            <h2>page {page}</h2>
          </div>
          <div className="page-controls">
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => setPage((current) => clampPage(current - 1))}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <input
              value={page}
              aria-label="Page number"
              inputMode="numeric"
              onChange={(event) => setPage(clampPage(Number(event.target.value)))}
            />
            <button
              type="button"
              aria-label="Next page"
              onClick={() => setPage((current) => clampPage(current + 1))}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        </header>
        <pre className="page-text">{generatedPage.join('\n')}</pre>
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
  selectedBook,
  onSelectBook,
}: {
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
                const address = nearbyBookAddress(q, r, wall, 1, book)
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

function LibraryWorld({
  selectedBook,
  onSelectBook,
}: {
  selectedBook: BookAddress
  onSelectBook: (address: BookAddress) => void
}) {
  return (
    <group>
      {roomOffsets.map(([q, r]) => (
        <HexRoom
          key={`${q}:${r}`}
          q={q}
          r={r}
          selectedBook={selectedBook}
          onSelectBook={onSelectBook}
        />
      ))}
      <Text position={[0, 4.2, -2.6]} fontSize={0.42} color="#f6e2a7" anchorX="center">
        click any spine
      </Text>
    </group>
  )
}

function HexRoom({
  q,
  r,
  selectedBook,
  onSelectBook,
}: {
  q: number
  r: number
  selectedBook: BookAddress
  onSelectBook: (address: BookAddress) => void
}) {
  const centerX = (q + r / 2) * 7.2
  const centerZ = r * 6.2

  return (
    <group position={[centerX, 0, centerZ]}>
      <mesh receiveShadow rotation={[Math.PI / 2, 0, Math.PI / 6]} position={[0, -0.05, 0]}>
        <cylinderGeometry args={[3.1, 3.1, 0.12, 6]} />
        <meshStandardMaterial color="#292215" roughness={0.72} metalness={0.05} />
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

export default App
