# Browser E2E

Playwright drives the six playgrounds against a deterministic, network-mocked model.
This is the net for everything jsdom can't see — real layout, real custom-element
upgrade, real event routing. Every browser-only bug the project has hit lived here.

```bash
pnpm e2e:install          # once: fetch the browsers
pnpm e2e                  # the suite (Chromium everywhere + WebKit where configured)
pnpm e2e:ui               # interactive runner
pnpm e2e:report           # last HTML report
E2E_ONLY=react pnpm e2e   # narrow to one app (also skips the other dev servers)
pnpm e2e:flake            # repeat each test 3x — run before a release, not in the gate
```

Touching `@aparte/core`? Rebuild it first (`nx build @aparte/core`): the Svelte, Angular
and demo-vanilla apps consume the built `dist`, and Angular additionally caches its
prebundle — delete `apps/playgrounds/angular/.angular/` if a change seems ignored. A red
run right after a core edit is usually a **stale dev server**, not a real failure.

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
| `demo-vanilla` | human-in-the-loop tool approval, against core's published `dist` |
| `real-model` | opt-in un-mocked smoke against a local model (`E2E_REAL_MODEL=1`) |

Which spec runs on which app is decided by `suiteFor()` in `playwright.config.ts`: the
boundary suites run on all five framework apps, the deep behaviour suites on `vanilla`
(core raw) and `react` (reference wrapper). WebKit covers every app except Angular.
