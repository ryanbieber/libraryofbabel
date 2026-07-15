export function SplashScreen({
  hasSave,
  onContinue,
  onNewJourney,
}: {
  hasSave: boolean
  onContinue: () => void
  onNewJourney: () => void
}) {
  return (
    <section className="splash-screen" aria-label="Start screen">
      <div className="splash-panel">
        <p className="splash-kicker">An homage to Borges</p>
        <h1>The Library of Babel</h1>
        <p className="splash-lede">
          The universe is an endless procession of hexagonal galleries: four walls of books, two open
          vestibules, shafts above and below, and stairs that repeat beyond memory.
        </p>
        <p>
          Every volume can be opened. Its pages are generated from its exact floor, gallery, wall,
          shelf, and position, so the same coordinates always return the same book.
        </p>
        <p className="splash-author">
          Walk the three accessible floors. Visit the sleeping closets and latrines between galleries.
          The barred passages are not the end of the Library—only the end of this map.
        </p>
        <p className="splash-controls">WASD to move. Mouse to look. Click to use. Space to jump. Touch controls appear in landscape.</p>
        <div className="splash-actions">
          {hasSave ? <button type="button" onClick={onContinue}>Continue</button> : null}
          <button type="button" className={hasSave ? 'secondary' : undefined} onClick={onNewJourney}>
            {hasSave ? 'New Journey' : 'Enter Library'}
          </button>
        </div>
      </div>
    </section>
  )
}
