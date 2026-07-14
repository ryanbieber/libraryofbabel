// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { BookReader } from './App'
import { defaultAddress, generatePage } from './lib/library'

describe('App interactions', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('starts with a splash screen that explains pointer movement', () => {
    const { container } = render(<App />)

    expect(screen.getByLabelText('Start screen')).toBeInTheDocument()
    expect(screen.getByText(/Hold the room to walk forward/)).toBeInTheDocument()
    expect(screen.getByText(/Mouse and touch use the same movement/)).toBeInTheDocument()
    expect(screen.queryByText(/Move with WASD/)).not.toBeInTheDocument()
    expect(container.querySelector('.command-bar')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    expect(screen.queryByLabelText('Start screen')).not.toBeInTheDocument()
    expect(screen.getByTestId('arena-viewport')).toBeInTheDocument()
  })

  it('moves forward by holding the viewport without showing bottom book cards', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    const viewport = screen.getByTestId('arena-viewport')
    expect(screen.queryByLabelText(/Open room 0,0 \/ north wall/)).not.toBeInTheDocument()

    holdViewportForward(viewport, 42, 'mouse')

    expect(container.querySelector('.nearby-book-list')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Open room 0,0 \/ north wall/)).not.toBeInTheDocument()
  })

  it('shows a two-page reader spread and flips forward through spreads', () => {
    function ReaderHarness() {
      const spread = 1
      return (
        <BookReader
          selectedBook={defaultAddress}
          floor={0}
          spread={spread}
          leftPageNumber={1}
          rightPageNumber={2}
          leftPage={generatePage({ ...defaultAddress, page: 1 })}
          rightPage={generatePage({ ...defaultAddress, page: 2 })}
          onClose={() => undefined}
          onSpreadChange={() => undefined}
        />
      )
    }

    const { container } = render(<ReaderHarness />)

    expect(container.querySelector('.book-reader')).toBeInTheDocument()
    expect(container.querySelectorAll('.book-page')).toHaveLength(2)
    expect(screen.getByText('page 1')).toBeInTheDocument()
    expect(screen.getByText('page 2')).toBeInTheDocument()
    expect(container.querySelector('.reader-actions')?.textContent).toContain('forward')
    expect(screen.getByDisplayValue('1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'forward' }))

    expect(container.querySelector('.book-spread.turn-forward')).toBeInTheDocument()
  })

  it('shows a reachable monk Talk action and opens then closes the dialogue panel', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    expect(container.querySelector('.npc-quest-marker.available')?.textContent).toBe('!')

    const talkButton = screen.getByRole('button', { name: /Talk to Hooded keeper of improbable words/ })
    fireEvent.click(talkButton)

    expect(screen.getByLabelText('Monk dialogue')).toBeInTheDocument()
    expect(screen.getByText(/Significant word/)).toBeInTheDocument()
    expect(screen.getByText(/contains the word babel/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Quest address book')).toBeInTheDocument()
    expect(screen.getByLabelText('Submit book coordinates')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close monk dialogue' }))

    expect(screen.queryByLabelText('Monk dialogue')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Talk to Hooded keeper of improbable words/ })).toBeInTheDocument()
    expect(container.querySelector('.npc-quest-marker.active')?.textContent).toBe('?')
  })

  it('validates the starting monk quest submission and rejects false coordinates', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))
    fireEvent.click(screen.getByRole('button', { name: /Talk to Hooded keeper of improbable words/ }))

    fireEvent.change(screen.getByLabelText('Quest room'), { target: { value: '0,0' } })
    fireEvent.change(screen.getByLabelText('Quest wall'), { target: { value: 'ceiling' } })
    fireEvent.change(screen.getByLabelText('Quest shelf'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Quest volume'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Quest page'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'test page' }))

    expect(screen.getAllByText('Choose a wall: north, east, south, west, or 1-4.')).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('Quest wall'), { target: { value: 'north' } })
    fireEvent.click(screen.getByRole('button', { name: 'test page' }))

    expect(screen.getAllByText(/A confident heretic is still a heretic/)).toHaveLength(2)
  })

  it('requires clicking a nearby door to enter mapped rooms, uses stairs with E, and blocks sealed exits', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    const viewport = screen.getByTestId('arena-viewport')
    dragViewport(viewport, 253)

    expect(screen.getByText('room 0,0 / east view')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open east door' }))
    expect(screen.getByText('Move closer to the east door.')).toBeInTheDocument()
    expect(screen.getByText('room 0,0 / east view')).toBeInTheDocument()

    holdViewportForward(viewport, 45)
    expect(screen.getByText('The east door is shut. Click or tap it to open it.')).toBeInTheDocument()
    expect(screen.getByText('room 0,0 / east view')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open east door' }))
    expect(screen.getByText('room 1,0 / east view')).toBeInTheDocument()
    expect(screen.getByText('east hall')).toBeInTheDocument()

    holdViewportForward(viewport, 88)
    fireEvent.click(screen.getByRole('button', { name: 'Open east door' }))
    expect(screen.getByText('room 2,0 / east view')).toBeInTheDocument()
    expect(screen.getByText('east archive')).toBeInTheDocument()

    pressKey('e')
    expect(screen.getByText('Floor 1')).toBeInTheDocument()

    holdViewportForward(viewport, 88)
    expect(screen.getByText('The east wall has no open passage here.')).toBeInTheDocument()
  })

  it('does not move with WASD after pointer controls replace keyboard movement', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    pressKey('w', 30)

    expect(screen.queryByLabelText(/Open room 0,0 \/ north wall/)).not.toBeInTheDocument()
    expect(screen.getByText('room 0,0 / north view')).toBeInTheDocument()
  })
})

function pressKey(key: string, times = 1) {
  for (let index = 0; index < times; index += 1) {
    fireEvent.keyDown(window, { key })
    fireEvent.keyUp(window, { key })
  }
}

function holdViewportForward(viewport: HTMLElement, times: number, pointerType = 'mouse') {
  for (let step = 0; step < times; step += 1) {
    const pointerId = step + 1
    fireEvent.pointerDown(viewport, { button: 0, clientX: 190, clientY: 420, pointerId, pointerType })
    fireEvent.pointerUp(viewport, { button: 0, pointerId, pointerType })
  }
}

function dragViewport(viewport: HTMLElement, deltaX: number) {
  const pointerId = 10_000
  const startX = 190
  fireEvent.pointerDown(viewport, { button: 0, clientX: startX, clientY: 420, pointerId, pointerType: 'mouse' })
  fireEvent.pointerMove(viewport, { button: 0, clientX: startX + deltaX, clientY: 420, pointerId, pointerType: 'mouse' })
  fireEvent.pointerUp(viewport, { button: 0, pointerId, pointerType: 'mouse' })
}
