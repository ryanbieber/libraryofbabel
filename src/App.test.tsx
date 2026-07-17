// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { BookReader } from './components/BookReader'
import { NpcDialoguePanel } from './components/NpcDialoguePanel'
import { QuestLog } from './components/QuestLog'
import { coordinate } from './lib/coordinate'
import { defaultAddress, generatePage } from './lib/library'
import type { LibraryNpc } from './lib/npcs'
import { shouldBookCapturePointer } from './lib/pointer'
import { poseNearBook } from './lib/roomGeometry'
import { defaultSavedGame, writeSavedGame } from './lib/saveGame'

describe('App interactions', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
    vi.restoreAllMocks()
  })

  it('introduces the impossible premise and enters the library', async () => {
    render(<App />)
    expect(screen.getByLabelText('Start screen')).toBeInTheDocument()
    expect(screen.getByText(/the Library makes knowledge total/i)).toBeInTheDocument()
    expect(screen.getByText(/unbounded coordinates/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Scale of the Library')).toHaveTextContent('1,312,000')
    expect(screen.getByLabelText('Scale of the Library')).toHaveTextContent('distinct possible volumes')
    expect(screen.getByText(/WASD/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    expect(screen.queryByLabelText('Start screen')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Journey introduction')).toHaveTextContent('Welcome to your new life.')
    expect(screen.getByLabelText('Journey introduction')).toHaveTextContent('The Library has been waiting for you.')
    expect(await screen.findByTestId('arena-viewport')).toHaveAttribute('data-zone', 'gallery')
    expect(screen.getByLabelText('Current location')).toHaveTextContent('gallery 0')
    expect(screen.getByLabelText('Current location')).toHaveTextContent('Floor 0')
    expect(screen.getByLabelText('Shelf address guide')).toHaveTextContent('Walls I-IV = A-D')
    expect(screen.getByLabelText('Shelf address guide')).toHaveTextContent('Rows I-V · top to bottom')
    expect(screen.getByLabelText('Shelf address guide')).toHaveTextContent('Books 1-32 · left to right')
    expect(screen.getAllByText('gallery 0').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(/four walls · two passages/i)).not.toBeInTheDocument()
  })

  it('uses hold-and-drag traversal without a door action', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))
    const viewport = await screen.findByTestId('arena-viewport')
    holdViewportForward(viewport, 3)
    expect(viewport).toHaveAttribute('data-zone', 'gallery')
    expect(screen.queryByRole('button', { name: /Open .* door/i })).not.toBeInTheDocument()
  })

  it('shows deterministic two-page reader spreads', () => {
    render(
      <BookReader
        selectedBook={defaultAddress}
        spread={1}
        leftPageNumber={1}
        rightPageNumber={2}
        leftPage={generatePage({ ...defaultAddress, page: 1 })}
        rightPage={generatePage({ ...defaultAddress, page: 2 })}
        onClose={() => undefined}
        onSpreadChange={() => undefined}
      />,
    )
    expect(screen.getAllByText(/floor 0 \/ gallery 0 \/ wall I \(A\) \/ row II \(2\) \/ book 8/i)).toHaveLength(3)
    expect(screen.getByText('page 1')).toBeInTheDocument()
    expect(screen.getByText('page 2')).toBeInTheDocument()
  })

  it('opens the starting monk quest and uses the canonical address fields', async () => {
    writeSaveNearStartingMonk()
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByTestId('arena-viewport')
    expect(container.querySelector('.npc-quest-marker.available')?.textContent).toBe('!')

    fireEvent.click(screen.getByRole('button', { name: /Talk to Hooded keeper of improbable words/ }))
    fireEvent.click(screen.getByRole('button', { name: 'accept quest' }))

    expect(screen.queryByLabelText('Monk dialogue')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Quest log')).toBeInTheDocument()
    expect(screen.getByLabelText('Quest floor')).toBeInTheDocument()
    expect(screen.getByLabelText('Quest gallery')).toBeInTheDocument()
    expect(screen.getByLabelText('Quest wall')).toHaveAttribute('placeholder', 'I / A / 1')
    expect(container.querySelector('.npc-quest-marker')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Minimize quest log' }))
    expect(screen.queryByLabelText('Quest floor')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Quest log')).not.toHaveTextContent('Find “babel”')
    expect(screen.getByRole('button', { name: 'Expand quest log' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Expand quest log' }))
    expect(screen.getByLabelText('Quest floor')).toBeInTheDocument()
  })

  it('validates the new quest coordinates', async () => {
    writeSaveNearStartingMonk()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByTestId('arena-viewport')
    fireEvent.click(screen.getByRole('button', { name: /Talk to Hooded keeper of improbable words/ }))
    fireEvent.click(screen.getByRole('button', { name: 'accept quest' }))

    fireEvent.change(screen.getByLabelText('Quest floor'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Quest gallery'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Quest wall'), { target: { value: 'ceiling' } })
    fireEvent.change(screen.getByLabelText('Quest row'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Quest book'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Quest page'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'test page' }))

    expect(screen.getAllByText('Wall must be I-IV, A-D, or 1-4.')).toHaveLength(2)
  })

  it('lets the blue-marker indexer locate a submitted word', async () => {
    const game = defaultSavedGame()
    game.pose = { ...game.pose, x: 2.35, z: -0.65 }
    writeSavedGame(game)
    const { container } = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByTestId('arena-viewport')
    expect(container.querySelector('.npc-quest-marker.inquiry')).toHaveTextContent('?')

    fireEvent.click(screen.getByRole('button', { name: 'Talk to Hooded indexer of lost words' }))
    expect(screen.getByText(/I have found many in my long attendance here/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Word to find'), { target: { value: 'babel' } })
    fireEvent.click(screen.getByRole('button', { name: 'ask the indexer' }))

    expect(await screen.findByLabelText('Word finder directions', {}, { timeout: 15_000 })).toHaveTextContent('“babel”')
    expect(screen.getByLabelText('Word finder directions')).toHaveTextContent(/floor .* gallery .* wall [IV]+ \([A-D]\).* row [IV]+ \([1-5]\).* book .* page/i)
  })

  it('opens the journey menu with Continue and New Journey choices', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))
    await screen.findByTestId('arena-viewport')
    fireEvent.click(screen.getByRole('button', { name: 'Journey' }))
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Journey' })).toBeInTheDocument()
  })

  it('uses a scene tap for interaction without a redundant mobile Use button', async () => {
    writeSaveNearStartingMonk()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const viewport = await screen.findByTestId('arena-viewport')
    expect(screen.getByLabelText('Current position and controls')).toHaveTextContent('WASD move')
    expect(screen.getByLabelText('Touch controls')).toBeInTheDocument()
    expect(screen.getByLabelText('Movement joystick')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jump' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByText('You jump.')).toBeInTheDocument()
    fireEvent.pointerDown(viewport, { button: 0, clientX: 200, clientY: 200, pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerUp(viewport, { button: 0, clientX: 200, clientY: 200, pointerId: 1, pointerType: 'touch' })
    expect(screen.getByLabelText('Monk dialogue')).toBeInTheDocument()
  })

  it('presents a leather-bound volume before opening it and shelves it when closed', async () => {
    const game = defaultSavedGame()
    game.pose = poseNearBook(defaultAddress)
    writeSavedGame(game)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const viewport = await screen.findByTestId('arena-viewport')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    fireEvent.pointerDown(viewport, { button: 0, clientX: 200, clientY: 200, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(viewport, { button: 0, clientX: 200, clientY: 200, pointerId: 1, pointerType: 'mouse' })

    expect(viewport).toHaveAttribute('data-book-presented', '0:0:A:1:7')
    expect(screen.getByText('The leather-bound volume eases out from the shelf.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Open book reader')).not.toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(screen.getByLabelText('Open book reader')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close book' }))
    expect(viewport).toHaveAttribute('data-book-presented', '')
    expect(screen.queryByLabelText('Open book reader')).not.toBeInTheDocument()
    expect(screen.getByText('The volume closes and settles back into the shelf.')).toBeInTheDocument()
  })

  it('supports the quest turn-in state with canonical coordinates', () => {
    const npc: LibraryNpc = {
      id: 'monk:0:0',
      floor: coordinate(0),
      gallery: coordinate(0),
      name: 'Hooded keeper of improbable words',
      quest: 'significant-word',
      dialogue: ['Reader, bring me a book that contains the word babel.'],
      position: { x: 0, z: 0 },
    }
    const onComplete = vi.fn()
    render(
      <NpcDialoguePanel
        npc={npc}
        questStatus="ready-to-complete"
        questFeedback={{ tone: 'success', text: 'Objective complete.' }}
        wordFinding={null}
        wordFinderFeedback={null}
        wordFinderSearching={false}
        onClose={() => undefined}
        onAcceptSignificantWordQuest={() => undefined}
        onCompleteSignificantWordQuest={onComplete}
        onFindWord={() => undefined}
      />,
    )
    expect(screen.getByLabelText('Quest ready to complete')).toHaveTextContent('Quest Complete')
    expect(screen.queryByLabelText('Submit book coordinates')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'complete quest' }))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('directs a player with a proven page back to the monk', () => {
    render(
      <QuestLog
        status="ready-to-complete"
        feedback={{ tone: 'success', text: 'The word is there.' }}
        minimized={false}
        onToggleMinimized={() => undefined}
        onSubmit={() => undefined}
      />,
    )

    expect(screen.getByLabelText('Quest log')).toHaveTextContent('Return to the hooded keeper')
    expect(screen.getByText(/floor 0, gallery 0/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Submit book coordinates')).not.toBeInTheDocument()
  })

  it('lets touch look gestures pass through book hit areas', () => {
    expect(shouldBookCapturePointer('mouse')).toBe(true)
    expect(shouldBookCapturePointer(undefined)).toBe(true)
    expect(shouldBookCapturePointer('touch')).toBe(false)
    expect(shouldBookCapturePointer('pen')).toBe(false)
  })
})

function holdViewportForward(viewport: HTMLElement, times: number) {
  for (let step = 0; step < times; step += 1) {
    const pointerId = step + 1
    fireEvent.pointerDown(viewport, { button: 0, clientX: 190, clientY: 420, pointerId, pointerType: 'mouse' })
    fireEvent.pointerUp(viewport, { button: 0, pointerId, pointerType: 'mouse' })
  }
}

function writeSaveNearStartingMonk() {
  const game = defaultSavedGame()
  game.pose = { ...game.pose, x: -2.35, z: 0.65, yaw: Math.PI }
  writeSavedGame(game)
}
