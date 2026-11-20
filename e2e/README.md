# Browser E2E

Playwright drives the six examples against a deterministic, network-mocked model.
This is the net for everything jsdom can't see — real layout, real custom-element
upgrade, real event routing. Every browser-only bug the project has hit lived here.

```bash
pnpm e2e:install          # once: fetch the browsers
pnpm e2e                  # the suite (Chromium everywhere + WebKit where configured)
pnpm e2e:ui               # interactive runner
pnpm e2e:report           # last HTML report
E2E_ONLY=react pnpm e2e   # narrow to one app (also skips the other dev servers)
E2E_NO_WEBKIT=1 pnpm e2e  # Chromium only — 254 tests to 134, and no windows stealing focus
pnpm e2e:flake            # repeat each test 3x — run before a release, not in the gate
```

`E2E_NO_WEBKIT` is a **local** convenience and is ignored under CI. Playwright's WebKit
build on Windows creates a real OS window even headless, so a full run pops several of them
and pulls you off a fullscreen app. Use it while iterating; never to decide a change is
safe — every browser-only bug this project has had was a WebKit one.

Touching `@aparte/core`? Rebuild it first (`nx build @aparte/core`): the Svelte, Angular
and vanilla-dist apps consume the built `dist`, and Angular additionally caches its
prebundle — delete `apps/examples/angular/.angular/` if a change seems ignored. A red
run right after a core edit is usually a **stale dev server**, not a real failure.

## After you change `@aparte/core`, clear the Angular cache

```bash
rm -rf apps/examples/angular/.angular/cache
```

`[angular]` is the one project whose dev server prebundles `@aparte/core` with Vite
and caches the result under `.angular/cache`. That cache is keyed on the dependency,
not on its contents, and the Angular CLI does not watch `node_modules` — so after a
change to core it keeps serving the OLD build, and only that project fails.

This is a **local-only** trap, which is what makes it worth writing down: CI starts
from a fresh checkout with no cache, so the pipeline stays green while your machine
fails, and the failure looks exactly like a flake. It cost a rename of 42 CSS classes
two wrong hypotheses (a stale `dist` — no, the renderers live in a lazy chunk; a
reused dev server — no, `reuseExistingServer` needs `E2E_REUSE_SERVERS=1`) before the
cache file was found with the old class name literally inside it.

Not fixed at the cause on purpose: `prebundle: { exclude: ["@aparte/core"] }` on the
dev-server builder is the obvious lever and it stops the app loading at all — every
angular spec fails, including the idle chat. Measured, reverted.

## How to write a spec here

- **Locators live in the page object.** Use `ChatPage` (`helpers/chat.ts`) — composer,
  bubbles, action bar, branch picker, segments, model selector. Don't hand-write
  `aparte-*` selectors in a spec; add an accessor instead, so a renamed class breaks
  one file rather than six.
- **Pick a scenario, don't fake the wire.** `installLlmMock(page, { scenario })` serves
  thinking deltas, code fences, tool calls, a held-open response, a 500, malformed SSE
  or an empty stream. The shapes mirror what `openai-compat` really parses.
- **Assert `collectPageErrors` is empty** in every test. A rendering bug that only
  shows up as an uncaught console error must fail the suite.
- **Never `waitForTimeout`.** Use web-first assertions (`expect(locator).toBeVisible()`,
  `expect.poll`) so a slow machine waits and a fast one doesn't idle. Timing sleeps are
  how a suite becomes flaky.
- **One scenario per test, no shared state.** `fullyParallel` is on; tests must not
  depend on each other's page, order, or leftovers.
- **Assert behaviour and geometry, not pixels.** There are no screenshot baselines on
  purpose — they drift across OSes and engines. Compare positions, computed styles,
  ARIA state, dispatched events.

Four more, from three defects a consumer found by hand in 1.15.0 (#270, #271, #272) while
every test here was green. Each was a combination the suite never built, not a missing case.

- **A layout invariant is measured frame by frame, in a thread already scrolled.** The thread
  moved a pixel each way on every streamed delta under every wrapper (#270). A read taken once
  the reply is done cannot see that, nor can a tolerance of a pixel or more, nor a first
  exchange (the space under the reply takes every change of its height). Read after each frame
  is drawn, not from inside it: a read inside a frame lands between two of core's own writes
  and sees a state no one was shown. `helpers/frames.ts` does both.
- **A rule of a component that can hold itself is tested nested.** A tool row holds tool rows
  (a sub-agent's transcript), and a rule keyed on the row's state with a descendant combinator
  coloured every call under a finished line as finished (#271). Compare the nested one with a
  copy of itself put outside, and check the look on its own as well, or a rule that matches
  nothing passes the comparison (`nested-rows.spec.ts`).
- **A stream test also sends what our producers never send.** Every adapter test sent a
  well-formed sequence; a server writing its own wire did not, and neither does a model that
  reasons again after it answers (#272). The unit suite now holds properties over seeded
  sequences; a spec that drives a stream should vary the order too.
- **A test is seen red before it is believed.** Break what it guards (revert the fix, or
  sabotage the code) and watch it fail, then restore. Two first attempts at these specs could
  not fail: a heading check that only said "not the settled one", and a thread measured on its
  first exchange.

## Suites

| Spec | Scope |
|---|---|
| `framework-smoke` | mount, model gate, send/stream ordering, transcript scroll — all 5 framework apps |
| `a11y` | axe-core scan (no critical/serious): idle, after an exchange, **open dropdown, mid-stream, failed turn**, plus a keyboard-only journey |
| `streaming-lifecycle` | the turn while in flight: streaming flags, `aria-busy`, action bar out of reach, send↔stop, cancel and recovery |
| `errors` | vendor 500, malformed SSE, empty stream — each must end the turn, stay usable, never throw — and the next send must work |
| `bubble-actions` | copy (clipboard), retry → branch + `‹1/2›` picker, inline edit → re-send, default action set per role |
| `segments` | thinking `<details>` open/close, code segment + copy yields source, no horizontal overflow |
| `attachments` | real picker → chip → remove → sent bubble → file content in the request, image thumbnail + preview event, strip/bubble alignment |
| `model-selector` | dropdown, collapsed provider groups, keyboard roving highlight, search filter, hostile model id |
| `multi-chat` | two chats on one page: replies land only in the sender, retry/streaming don't leak (vanilla `?chats=2`) |
| `responsive` | 390×844: usable composer, no sideways page scroll, dropdown inside the viewport |
| `bubble-layout` | real-geometry invariants of the bubble (vanilla, incl. WebKit) |
| `vanilla-dist` | human-in-the-loop tool approval, against core's published `dist` |
| `subagent-transcript` | a sub-agent's conversation under its line, through the scripted model: a failed read, a refused command, a working line under reduced motion, each call looks as it would alone; its slow reasoning reads "Thinking" in every frame (vanilla incl. WebKit, react) |
| `nested-rows` | every state of a line with a call of every state under it (196 calls, `?harness=nested-rows`): each looks as it would alone, with and without reduced motion; each state still looks as designed on its own; one caret in a reply being written (vanilla incl. WebKit) |
| `thread-holds-still` | a reasoning reply streaming into an already scrolled thread, read after every frame at half a pixel: the reply's own block, a sub-agent's line closed and open (every example) |
| `real-model` | opt-in un-mocked smoke against a local model (`E2E_REAL_MODEL=1`) |

Which spec runs on which app is decided by `suiteFor()` in `playwright.config.ts`: the
boundary suites run on all five framework apps, the deep behaviour suites on `vanilla`
(core raw) and `react` (reference wrapper). WebKit covers every app except Angular.
