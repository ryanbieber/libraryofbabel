// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { BookReader } from './components/BookReader'
import { defaultAddress, generatePage } from './lib/library'

describe('App interactions', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('introduces and enters the hexagonal multi-floor library', async () => {
    render(<App />)
    expect(screen.getByLabelText('Start screen')).toBeInTheDocument()
    expect(screen.getByText(/endless procession of hexagonal galleries/i)).toBeInTheDocument()
    expect(screen.getByText(/Hold to walk. Drag to look/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))

    expect(screen.queryByLabelText('Start screen')).not.toBeInTheDocument()
    expect(await screen.findByTestId('arena-viewport')).toHaveAttribute('data-zone', 'gallery')
    expect(screen.getByText('gallery 0')).toBeInTheDocument()
    expect(screen.getByText(/four walls · two passages/i)).toBeInTheDocument()
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
    expect(screen.getAllByText(/floor 0 \/ gallery 0 \/ wall A/i)).toHaveLength(2)
    expect(screen.getByText('page 1')).toBeInTheDocument()
    expect(screen.getByText('page 2')).toBeInTheDocument()
  })

  it('opens the starting monk quest and uses the canonical address fields', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))
    await screen.findByTestId('arena-viewport')
    expect(container.querySelector('.npc-quest-marker.available')?.textContent).toBe('!')

    fireEvent.click(screen.getByRole('button', { name: /Talk to Hooded keeper of improbable words/ }))
    fireEvent.click(screen.getByRole('button', { name: 'accept quest' }))

    expect(screen.getByLabelText('Quest floor')).toBeInTheDocument()
    expect(screen.getByLabelText('Quest gallery')).toBeInTheDocument()
    expect(screen.getByLabelText('Quest wall')).toHaveAttribute('placeholder', 'A')
    expect(container.querySelector('.npc-quest-marker.active')?.textContent).toBe('?')
  })

  it('validates the new quest coordinates', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))
    await screen.findByTestId('arena-viewport')
    fireEvent.click(screen.getByRole('button', { name: /Talk to Hooded keeper of improbable words/ }))
    fireEvent.click(screen.getByRole('button', { name: 'accept quest' }))

    fireEvent.change(screen.getByLabelText('Quest floor'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Quest gallery'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Quest wall'), { target: { value: 'ceiling' } })
    fireEvent.change(screen.getByLabelText('Quest shelf'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Quest volume'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Quest page'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'test page' }))

    expect(screen.getAllByText('Wall must be A, B, C, or D.')).toHaveLength(2)
  })

  it('opens the journey menu with Continue and New Journey choices', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Library' }))
    await screen.findByTestId('arena-viewport')
    fireEvent.click(screen.getByRole('button', { name: 'Journey' }))
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Journey' })).toBeInTheDocument()
  })
})

function holdViewportForward(viewport: HTMLElement, times: number) {
  for (let step = 0; step < times; step += 1) {
    const pointerId = step + 1
    fireEvent.pointerDown(viewport, { button: 0, clientX: 190, clientY: 420, pointerId, pointerType: 'mouse' })
    fireEvent.pointerUp(viewport, { button: 0, pointerId, pointerType: 'mouse' })
  }
}
