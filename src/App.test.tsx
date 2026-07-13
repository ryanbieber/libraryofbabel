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

  it('starts with a splash screen that explains keyboard and touchscreen movement', () => {
    const { container } = render(<App />)

    expect(screen.getByLabelText('Start screen')).toBeInTheDocument()
    expect(screen.getByText(/Move with WASD/)).toBeInTheDocument()
    expect(screen.getByText(/On mobile/)).toBeInTheDocument()
    expect(container.querySelector('.command-bar')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    expect(screen.queryByLabelText('Start screen')).not.toBeInTheDocument()
    expect(screen.getByTestId('arena-viewport')).toBeInTheDocument()
  })

  it('moves forward by holding the mobile viewport and opens a reachable volume in the reader', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    const viewport = screen.getByTestId('arena-viewport')
    expect(screen.queryByLabelText(/Open room 0,0 \/ north wall/)).not.toBeInTheDocument()

    for (let step = 0; step < 18; step += 1) {
      const pointerId = step + 1
      fireEvent.pointerDown(viewport, { button: 0, clientX: 190, clientY: 420, pointerId, pointerType: 'touch' })
      fireEvent.pointerMove(viewport, { clientX: 206, clientY: 420, pointerId, pointerType: 'touch' })
      fireEvent.pointerUp(viewport, { pointerId, pointerType: 'touch' })
    }

    const volume = screen.getAllByRole('button', { name: /Open room 0,0 \/ north wall/ })[0]
    fireEvent.click(volume)

    expect(container.querySelector('.book-reader')).toBeInTheDocument()
    expect(container.querySelector('.reader-actions')?.textContent).toContain('forward')
    expect(screen.getByDisplayValue('1')).toBeInTheDocument()
  })

  it('requires clicking a nearby door to enter mapped rooms, uses stairs with E, and blocks sealed exits', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    pressKey('ArrowRight')
    expect(screen.getByText('room 0,0 / east view')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open east door' }))
    expect(screen.getByText('Move closer to the east door.')).toBeInTheDocument()
    expect(screen.getByText('room 0,0 / east view')).toBeInTheDocument()

    pressKey('w', 5)
    expect(screen.getByText('The east door is shut. Click or tap it to open it.')).toBeInTheDocument()
    expect(screen.getByText('room 0,0 / east view')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open east door' }))
    expect(screen.getByText('room 1,0 / east view')).toBeInTheDocument()
    expect(screen.getByText('east hall')).toBeInTheDocument()

    pressKey('w', 10)
    fireEvent.click(screen.getByRole('button', { name: 'Open east door' }))
    expect(screen.getByText('room 2,0 / east view')).toBeInTheDocument()
    expect(screen.getByText('east archive')).toBeInTheDocument()

    pressKey('e')
    expect(screen.getByText('Floor 1')).toBeInTheDocument()

    pressKey('w', 10)
    expect(screen.getByText('The east wall has no open passage here.')).toBeInTheDocument()
  })
})

function pressKey(key: string, times = 1) {
  for (let index = 0; index < times; index += 1) {
    fireEvent.keyDown(window, { key })
    fireEvent.keyUp(window, { key })
  }
}
