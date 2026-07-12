// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App interactions', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  it('moves through the Arena viewport and opens a visible volume as an old-book reader', () => {
    const { container } = render(<App />)

    fireEvent.click(screen.getByLabelText('Open explanation'))
    expect(container.querySelector('.help-panel')).toBeInTheDocument()
    fireEvent.click(container.querySelector('.help-panel .close-reader')!)

    expect(container.querySelector('.scene-library')).toBeInTheDocument()
    expect(screen.getByTestId('arena-viewport')).toBeInTheDocument()
    expect(screen.getByText('FLOOR 0')).toBeInTheDocument()
    expect(screen.getByText('central catalog')).toBeInTheDocument()
    expect(screen.getByText('north door')).toBeInTheDocument()

    expect(screen.getByText('stairs up')).toBeDisabled()
    expect(screen.getByText('FLOOR 0')).toBeInTheDocument()

    fireEvent.click(container.querySelector('.move-pad [aria-label="Turn right"]')!)
    expect(screen.getAllByText('east')).toHaveLength(2)

    fireEvent.click(container.querySelector('.move-pad [aria-label="Forward"]')!)
    expect(screen.getByText('ROOM 1,0')).toBeInTheDocument()
    expect(screen.getByText('east hall')).toBeInTheDocument()

    fireEvent.click(container.querySelector('.viewport-zone-back')!)
    expect(screen.getByText('ROOM 0,0')).toBeInTheDocument()

    fireEvent.click(container.querySelector('.viewport-zone-forward')!)
    expect(screen.getByText('ROOM 1,0')).toBeInTheDocument()

    fireEvent.click(container.querySelector('.viewport-zone-forward')!)
    expect(screen.getByText('ROOM 2,0')).toBeInTheDocument()
    expect(screen.getByText('east archive')).toBeInTheDocument()

    fireEvent.click(screen.getByText('stairs up'))
    expect(screen.getByText('FLOOR 1')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getAllByText('north')).toHaveLength(2)

    const volume = container.querySelector(
      '[aria-label="Open room 2,0 / north wall / shelf 3 / volume 4"]',
    )
    expect(volume).toBeInTheDocument()
    fireEvent.click(volume!)

    expect(container.querySelector('.book-reader')).toBeInTheDocument()
    expect(container.querySelector('.close-reader')).toBeInTheDocument()
    expect(container.querySelector('.reader-actions')?.textContent).toContain('forward')
    expect(screen.getByDisplayValue('1')).toBeInTheDocument()
  })
})
