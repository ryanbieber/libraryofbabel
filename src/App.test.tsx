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

  it('moves between rooms and opens a selected volume as an old-book reader', () => {
    const { container } = render(<App />)

    expect(container.querySelector('.scene-desert')).toBeInTheDocument()
    expect(screen.getByText('“Are you sure you want to give yourself over to the library?”')).toBeInTheDocument()
    fireEvent.click(screen.getByText('?'))
    expect(container.querySelector('.help-panel')).toBeInTheDocument()
    fireEvent.click(container.querySelector('.help-panel .close-reader')!)

    fireEvent.click(screen.getByText('no'))
    expect(container.querySelector('.scene-library')).toBeInTheDocument()
    expect(screen.getByText('FLOOR 0')).toBeInTheDocument()

    fireEvent.click(container.querySelector('.action-buttons button')!)
    expect(screen.getByText('FLOOR 1')).toBeInTheDocument()

    fireEvent.click(screen.getByText('E'))
    expect(screen.getByText('ROOM 1,0')).toBeInTheDocument()

    fireEvent.click(screen.getByText('wall 5'))
    const volume = container.querySelector(
      '[aria-label="Open hex 1,0 / wall 5 / shelf 3 / volume 4"]',
    )
    expect(volume).toBeInTheDocument()
    fireEvent.click(volume!)

    expect(container.querySelector('.book-reader')).toBeInTheDocument()
    expect(container.querySelector('.close-reader')).toBeInTheDocument()
    expect(screen.getByText('forward')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1')).toBeInTheDocument()
  })
})
