# @aparte-workspace/e2e — browser smoke tests

Playwright drives every playground in a real browser and asserts the behaviours
the jsdom unit tests can't see — the **framework boundary**, where every M6 bug
lived (React-19 getter throw, Angular double-`define`, no-scroll viewport,
empty model selector, assistant-before-user ordering).

## What it checks

Per framework app (`react`, `vue`, `svelte`, `angular`, `vanilla`):

1. **Mounts without runtime errors** — no uncaught `pageerror` blanks the app.
2. **Model selector populates + ungates** — options render and the require-model
   gate opens once a model auto-selects.
3. **Send → streamed reply, correctly ordered** — the user bubble precedes the
   assistant bubble, and markdown renders.
4. **Scroll on overflow** — the transcript scrolls instead of compressing.

`demo-vanilla` (consumes `dist`) runs the **human-in-the-loop** approve/reject
tool flow instead.

## No key, no LM Studio, no network

The model API is mocked at the network layer (`helpers/mock-llm.ts` intercepts
`GET /models` and `POST /chat/completions`). The playgrounds keep their real
BYOK wiring untouched — Playwright just answers the outbound calls. Runs are
identical on every machine and in CI.

## Running

```bash
pnpm build            # once — demo-vanilla consumes @aparte/core from dist
pnpm e2e:install      # once — download the Chromium Playwright uses
pnpm e2e              # all apps
pnpm e2e --project=react           # one app
pnpm e2e:ui           # interactive runner
```

Narrow to one app's dev server (faster) with the `E2E_ONLY` env var:

```bash
E2E_ONLY=react pnpm e2e                        # bash / POSIX
$env:E2E_ONLY='react'; pnpm e2e                # PowerShell (Windows)
```

The opt-in real-model smoke (a live local server, CORS enabled) is skipped
unless `E2E_REAL_MODEL=1`:

```bash
E2E_REAL_MODEL=1 E2E_ONLY=react pnpm e2e --project=react       # bash / POSIX
$env:E2E_REAL_MODEL='1'; $env:E2E_ONLY='react'; pnpm e2e --project=react   # PowerShell
```

The dev servers boot automatically (ports 5301-5306) and are reused if already
running locally.
