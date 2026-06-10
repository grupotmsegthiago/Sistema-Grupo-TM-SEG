---
name: React component render tests
description: How to render/test React components under node --test (no Vite/jsdom by default) in this repo.
---

# React component render tests

This repo has no Vite in the test path and component files import assets (e.g. `.png`).
To render a component under `node --test`:

- Use jsdom for the DOM, mock `global.fetch` to control data-load effects, render via
  `react-dom/client` `createRoot`, and flush effects with `React.act` (React 18.3 has `React.act`).
  Set `globalThis.IS_REACT_ACT_ENVIRONMENT = true`. Async effects (fetch) need extra
  `await React.act(async () => { await Promise.resolve(); })` flushes after the initial render.
- Asset imports (`.png/.svg/...`) must be stubbed by a module loader: hooks live in
  `scripts/test-loaders/asset-loader.mjs` and are activated by `scripts/test-loaders/register.mjs`
  (which calls `module.register`). Run with:
  `node --import tsx --import ./scripts/test-loaders/register.mjs --test scripts/*.test.tsx`.

**Why:** With `--import`, exporting `resolve`/`load` hooks is NOT enough — only `--loader`
(deprecated) auto-registers exported hooks. With `--import` you must call `module.register()`,
hence the separate `register.mjs`. Loader chain runs last-registered-first, so registering the
asset loader after tsx lets it intercept images before tsx and delegate everything else.

**How to apply:** `scripts/run-tests.sh` runs both suites (server-side `*.test.ts` via plain tsx,
component `*.test.tsx` with the loader). It's wired as the `test` validation command.
`scripts/dhl-intake-render.test.tsx` is the reference pattern (mocks the public GET with
snapshots to resume at a chosen step, then asserts on `container.innerHTML`). jsdom may serialize
inline hex colors as `rgb(...)`, so match both `#ffcc00` and `rgb(255, 204, 0)`.
