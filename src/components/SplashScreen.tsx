export function SplashScreen({ onStart }: { onStart: () => void }) {
  return (
    <section className="splash-screen" aria-label="Start screen">
      <div className="splash-panel">
        <p className="splash-kicker">An homage to Borges</p>
        <h1>The Library of Babel</h1>
        <p className="splash-lede">
          In Jorge Luis Borges's 1941 story, the universe is imagined as an endless library: every book
          that can be written, every truth, every lie, every biography, and every nonsense page, all
          shelved somewhere in the dark.
        </p>
        <p>
          This app turns that impossible premise into a place you can walk through: rooms, walls,
          shelves, volumes, and deterministic pages. It is not trying to solve the library. It is here to
          let you feel the absurd scale of a system that contains everything and almost no meaning.
        </p>
        <p className="splash-author">
          Borges was an Argentine writer whose fiction often treated infinity, labyrinths, language, and
          reality as traps disguised as ideas.
        </p>
        <p className="splash-controls">
          WASD to move. Mouse to look. Left click to use. Space to jump.
        </p>
        <button type="button" onClick={onStart}>
          Enter Library
        </button>
      </div>
    </section>
  )
}
