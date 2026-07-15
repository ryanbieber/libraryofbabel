// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { BookReader } from './components/BookReader'
import { defaultAddress, generatePage } from './lib/library'

describe('App interactions', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('starts with a splash screen that introduces the Borges premise', () => {
    const { container } = render(<App />)

    expect(screen.getByLabelText('Start screen')).toBeInTheDocument()
    expect(screen.getByText(/Jorge Luis Borges's 1941 story/)).toBeInTheDocument()
    expect(screen.getByText(/universe is imagined as an endless library/)).toBeInTheDocument()
    expect(screen.getByText(/This app turns that impossible premise into a place you can walk through/)).toBeInTheDocument()
    expect(screen.getByText(/An homage to Borges/)).toBeInTheDocument()
    expect(screen.getByText(/WASD to move/)).toBeInTheDocument()
    expect(screen.queryByText(/Hold to walk/)).not.toBeInTheDocument()
    expect(container.querySelector('.command-bar')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    expect(screen.queryByLabelText('Start screen')).not.toBeInTheDocument()
    expect(screen.getByTestId('arena-viewport')).toBeInTheDocument()
  })

  it('does not show bottom book cards in the first-person viewport', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    const viewport = screen.getByTestId('arena-viewport')
    expect(screen.queryByLabelText(/Open room 0,0 \/ north wall/)).not.toBeInTheDocument()

    expect(container.querySelector('.nearby-book-list')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Open room 0,0 \/ north wall/)).not.toBeInTheDocument()
    expect(viewport).toBeInTheDocument()
  })

  it('shows a two-page reader spread and flips forward through spreads', () => {
    function ReaderHarness() {
      const spread = 1
      return (
        <BookReader
          selectedBook={defaultAddress}
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
    expect(screen.getByRole('button', { name: 'accept quest' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Quest address book')).not.toBeInTheDocument()
    expect(container.querySelector('.npc-quest-marker.available')?.textContent).toBe('!')

    fireEvent.click(screen.getByRole('button', { name: 'accept quest' }))

    expect(screen.getByLabelText('Quest address book')).toBeInTheDocument()
    expect(screen.getByLabelText('Submit book coordinates')).toBeInTheDocument()
    expect(container.querySelector('.npc-quest-marker.active')?.textContent).toBe('?')

    fireEvent.click(screen.getByRole('button', { name: 'Close monk dialogue' }))

    expect(screen.queryByLabelText('Monk dialogue')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Talk to Hooded keeper of improbable words/ })).toBeInTheDocument()
    expect(container.querySelector('.npc-quest-marker.active')?.textContent).toBe('?')
  })

  it('validates the starting monk quest submission and rejects false coordinates', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))
    fireEvent.click(screen.getByRole('button', { name: /Talk to Hooded keeper of improbable words/ }))
    fireEvent.click(screen.getByRole('button', { name: 'accept quest' }))

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

  it('does not activate the starting monk quest until the player accepts it', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))
    fireEvent.click(screen.getByRole('button', { name: /Talk to Hooded keeper of improbable words/ }))

    expect(container.querySelector('.npc-quest-marker.available')?.textContent).toBe('!')
    expect(container.querySelector('.npc-quest-marker.active')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Submit book coordinates')).not.toBeInTheDocument()
  })

  it('uses mouse look and left click interaction for faced doors', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    const viewport = screen.getByTestId('arena-viewport')
    expect(viewport).toHaveAttribute('data-room-kind', 'gallery')
    dragViewport(viewport, 330)

    expect(screen.getAllByText('room 0,0 / east view').length).toBeGreaterThanOrEqual(1)

    clickViewport(viewport)
    expect(screen.getByText('Move closer to the east door.')).toBeInTheDocument()
    expect(screen.getAllByText('room 0,0 / east view').length).toBeGreaterThanOrEqual(1)
  })

  it('exposes WoW-style keyboard, touch, jump, and readout controls without a movement HUD', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    expect(screen.queryByLabelText('Movement controls')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Current position and controls')).toHaveTextContent('WASD move')
    expect(screen.getByLabelText('Touch controls')).toBeInTheDocument()
    expect(screen.getByLabelText('Movement joystick')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jump' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByText('You jump.')).toBeInTheDocument()
  })
})

function clickViewport(viewport: HTMLElement) {
  const pointerId = 20_000
  fireEvent.pointerDown(viewport, { button: 0, clientX: 190, clientY: 420, pointerId, pointerType: 'mouse' })
  fireEvent.pointerUp(viewport, { button: 0, clientX: 190, clientY: 420, pointerId, pointerType: 'mouse' })
}

function dragViewport(viewport: HTMLElement, deltaX: number) {
  const pointerId = 10_000
  const startX = 190
  fireEvent.pointerDown(viewport, { button: 0, clientX: startX, clientY: 420, pointerId, pointerType: 'mouse' })
  fireEvent.pointerMove(viewport, { button: 0, clientX: startX + deltaX, clientY: 420, pointerId, pointerType: 'mouse' })
  fireEvent.pointerUp(viewport, { button: 0, pointerId, pointerType: 'mouse' })
}
