// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

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

  it('moves forward by holding the viewport and opens a reachable volume in the reader', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    const viewport = screen.getByTestId('arena-viewport')
    expect(screen.queryByLabelText(/Open room 0,0 \/ north wall/)).not.toBeInTheDocument()

    holdViewportForward(viewport, 42, 'mouse')

    const volume = screen.getAllByRole('button', { name: /Open room 0,0 \/ north wall/ })[0]
    fireEvent.click(volume)

    expect(container.querySelector('.book-reader')).toBeInTheDocument()
    expect(screen.getByText('page 1')).toBeInTheDocument()
    expect(screen.getByText('page 2')).toBeInTheDocument()
    expect(container.querySelector('.reader-actions')?.textContent).toContain('forward')
    expect(screen.getByDisplayValue('1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'forward' }))

    expect(screen.getByText('page 3')).toBeInTheDocument()
    expect(screen.getByText('page 4')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
  })

  it('shows a reachable monk Talk action and opens then closes the dialogue panel', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    const talkButton = screen.getByRole('button', { name: /Talk to Hooded keeper of the red rumor/ })
    fireEvent.click(talkButton)

    expect(screen.getByLabelText('Monk dialogue')).toBeInTheDocument()
    expect(screen.getByText(/Crimson rumor/)).toBeInTheDocument()
    expect(screen.getByText(/crimson book/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close monk dialogue' }))

    expect(screen.queryByLabelText('Monk dialogue')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Talk to Hooded keeper of the red rumor/ })).toBeInTheDocument()
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
