import { X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { BookAddress } from '../lib/library'
import { addressLabel } from '../lib/library'
import { clampSpread } from '../lib/bookSpread'
import { highlightPage, type HighlightSegment } from '../lib/words'

type PageTurnDirection = 'forward' | 'back' | null

export function BookReader({
  selectedBook,
  spread,
  leftPageNumber,
  rightPageNumber,
  leftPage,
  rightPage,
  onClose,
  onSpreadChange,
}: {
  selectedBook: BookAddress
  spread: number
  leftPageNumber: number
  rightPageNumber: number
  leftPage: string[]
  rightPage: string[]
  onClose: () => void
  onSpreadChange: (spread: number) => void
}) {
  const [turnDirection, setTurnDirection] = useState<PageTurnDirection>(null)
  const turnTimeoutRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (turnTimeoutRef.current !== null) {
        window.clearTimeout(turnTimeoutRef.current)
      }
    },
    [],
  )

  function requestSpread(nextSpreadValue: number) {
    const nextSpread = clampSpread(nextSpreadValue)
    if (nextSpread === spread) return

    setTurnDirection(nextSpread > spread ? 'forward' : 'back')
    onSpreadChange(nextSpread)
    if (turnTimeoutRef.current !== null) {
      window.clearTimeout(turnTimeoutRef.current)
    }
    turnTimeoutRef.current = window.setTimeout(() => setTurnDirection(null), 420)
  }

  const spreadClassName = ['book-spread', turnDirection ? `turn-${turnDirection}` : ''].join(' ')

  return (
    <section className="book-reader" aria-label="Open book reader">
      <div className="book-shell">
        <button type="button" className="close-reader" aria-label="Close book" onClick={onClose}>
          <X size={22} aria-hidden="true" />
        </button>
        <div className="book-cover">
          <div className={spreadClassName}>
            <article className="book-page left">
              <span>{addressLabel(selectedBook)}</span>
              <h2>page {leftPageNumber}</h2>
              <HighlightedPage lines={leftPage} />
            </article>
            <article className="book-page right">
              <span>{addressLabel(selectedBook)}</span>
              <h2>page {rightPageNumber}</h2>
              <HighlightedPage lines={rightPage} />
            </article>
          </div>
        </div>
        <div className="reader-actions">
          <button type="button" onClick={() => requestSpread(spread - 1)}>
            back
          </button>
          <label>
            spread
            <input
              value={spread}
              aria-label="Spread number"
              inputMode="numeric"
              onChange={(event) => requestSpread(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={() => requestSpread(spread + 1)}>
            forward
          </button>
        </div>
      </div>
    </section>
  )
}

function HighlightedPage({ lines }: { lines: string[] }) {
  const highlightedLines = useMemo(() => highlightPage(lines), [lines])

  return <pre>{highlightedLines.map((line, lineIndex) => (
    <Fragment key={`${lineIndex}:${line.length}`}>
      <HighlightedLine segments={line} />
      {lineIndex < highlightedLines.length - 1 ? '\n' : null}
    </Fragment>
  ))}</pre>
}

function HighlightedLine({ segments }: { segments: HighlightSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.highlight ? (
          <mark key={`${index}:${segment.text}`} className="english-word">
            {segment.text}
          </mark>
        ) : (
          <Fragment key={`${index}:${segment.text}`}>{segment.text}</Fragment>
        ),
      )}
    </>
  )
}
