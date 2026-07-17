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
        <div className="splash-scroll-content">
          <header className="splash-hero">
            <p className="splash-kicker">An interactive homage to Jorge Luis Borges</p>
            <h1>The Library of Babel</h1>
            <p className="splash-lede">
              A universe made entirely of books—and the terrible promise that one of them says
              everything.
            </p>
          </header>

          <div className="splash-story-grid">
            <div className="splash-story">
              <p className="splash-section-label">The impossible premise</p>
              <p>
                Borges imagines an endless procession of hexagonal galleries. Every book has the same
                length and uses the same 25 symbols. The Library contains every possible arrangement of
                them: every history, confession, proof, prophecy, and the volume that describes your life
                down to this moment.
              </p>
              <p>
                That promise is also the nightmare. For every true account there are countless false ones,
                plus near-perfect copies that differ by a single mark. The Library makes knowledge total
                while making certainty almost impossible. Everything can be written, yet meaning becomes
                rarer—and harder to trust—than ever.
              </p>
            </div>

            <aside className="splash-scale" aria-label="Scale of the Library">
              <p className="splash-section-label">The mathematics</p>
              <dl>
                <div>
                  <dt>25</dt>
                  <dd>symbols in the alphabet</dd>
                </div>
                <div>
                  <dt>1,312,000</dt>
                  <dd>symbols in every volume</dd>
                </div>
                <div className="splash-scale-total">
                  <dt>25<sup>1,312,000</sup></dt>
                  <dd>distinct possible volumes</dd>
                </div>
              </dl>
              <p className="splash-scale-note">
                Finite as a number. Physically impossible to build or finish exploring.
              </p>
            </aside>
          </div>

          <div className="splash-adaptation">
            <p className="splash-section-label">Explore the idea</p>
            <p>
              This adaptation makes the thought experiment walkable. Floors and galleries continue through
              unbounded coordinates, and every page is generated from its exact address. Return to the same
              floor, gallery, wall, row, book, and page and you will find the same text—without storing the
              impossible Library itself.
            </p>
          </div>
        </div>

        <footer className="splash-footer">
          <p className="splash-controls">
            <span>Move</span> WASD <i aria-hidden="true">·</i> <span>Look</span> Mouse{' '}
            <i aria-hidden="true">·</i> <span>Use</span> Click <i aria-hidden="true">·</i>{' '}
            <span>Jump</span> Space <i aria-hidden="true">·</i> <span>Touch</span> Landscape
          </p>
          <div className="splash-actions">
            {hasSave ? (
              <button type="button" onClick={onContinue}>Continue</button>
            ) : null}
            <button type="button" className={hasSave ? 'secondary' : undefined} onClick={onNewJourney}>
              {hasSave ? 'New Journey' : 'Enter Library'}
            </button>
          </div>
        </footer>
      </div>
    </section>
  )
}
