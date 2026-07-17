# Library of Babel

An interactive homage to Jorge Luis Borges's **The Library of Babel**.

Play it here: <https://ryanbieber.github.io/libraryofbabel/>

## About

This project turns Borges's impossible library into a browser-based space: three floors of aligned
hexagonal galleries, guarded lightwells, open vestibules, spiral stairs, sleeping closets, latrines,
four walls of books, and deterministic pages. It is a small game-like tribute to the story's unsettling
premise: a universe that contains every possible book, almost all of it meaningless.

The playable map remains three floors by five galleries. Fogged, simplified gallery shells, stair
flights, and architecture beyond locked grilles make that finite map feel like one accessible window
onto a much larger Library; the continuation is visual only and disappears before its extent can be
measured.

No book text is stored. Pages are generated in the browser from a book address and page number, so the
same coordinates always return the same page.

Every shelf uses the same restrained binding and physical book format. The five-symbol marks on the
spines come from a separate deterministic cover seed; they are decorative inscriptions, not titles or
addresses, and do not describe or predict the generated pages.

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

## Book addresses

The current floor and signed gallery coordinate are always shown on screen. Inside each gallery,
brass signs identify walls I-IV (also accepted as A-D or 1-4), rows I-V from top to bottom, and
books 1-32 from left to right. Hovering a reachable book shows its exact translated address.

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

### Rendering budget

Playable scene loading is capped at 6 local scenes. Visual continuation is constructed from fixed data
and capped at 951 instanced details and 23 additional draw calls for any player pose. It adds no
colliders, navigation nodes, interaction handlers, or dynamically expanding scene lists. The renderer
publishes current object, draw-call, geometry, and texture counts as `data-*` attributes on the arena
viewport so a stationary desktop or mobile-landscape view can be sampled repeatedly for growth. Unit
tests enumerate representative poses and enforce deterministic construction and all three caps.

## Deployment

GitHub Pages deploys from `.github/workflows/pages.yml` when changes land on `main`.
