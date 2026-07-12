# Library of Babel

A public proof-of-concept React app for GitHub Pages. It turns the Library of Babel premise into an interactive 3D browser of addressed rooms, shelves, books, and deterministic pages.

The app uses the canonical book scale:

- 410 pages per book
- 40 lines per page
- 80 symbols per line
- 25 symbols in the alphabet
- 1,312,000 symbols per book

No book text is stored. Pages are generated deterministically in the browser from a book address and page number.

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

GitHub Pages deploys from `.github/workflows/pages.yml` using GitHub Actions.
