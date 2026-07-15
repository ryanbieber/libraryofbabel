# Library of Babel

An interactive homage to Jorge Luis Borges's **The Library of Babel**.

Play it here: <https://ryanbieber.github.io/libraryofbabel/>

## About

This project turns Borges's impossible library into a browser-based space: three floors of aligned
hexagonal galleries, guarded lightwells, open vestibules, spiral stairs, sleeping closets, latrines,
four walls of books, and deterministic pages. It is a small game-like tribute to the story's unsettling
premise: a universe that contains every possible book, almost all of it meaningless.

No book text is stored. Pages are generated in the browser from a book address and page number, so the
same coordinates always return the same page.

## Scale

The app uses the story's familiar book structure:

- 410 pages per book
- 40 lines per page
- 80 symbols per line
- 25 symbols in the alphabet
- 1,312,000 symbols per book

## Controls

- Hold to walk forward; keep holding to climb stairs.
- Drag while holding to look around.
- Click or tap nearby books and people.
- Use **Journey** to continue or begin again. Progress is saved in this browser.

## Development

```sh
npm install
npm run dev
```

## Validation

```sh
npm run lint
npm test -- --run
npm run build
```

## Deployment

GitHub Pages deploys from `.github/workflows/pages.yml` when changes land on `main`.
