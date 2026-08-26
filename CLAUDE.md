# CLAUDE.md — aparte

> **aparte** — scope `@aparte`, GitHub org `apartejs`, pronounced *"ah-par-té"* (French
> *aparté*: a line spoken aside; a private word taken "in aparte"). Bonus EN reading:
> *a part* = one composable piece.
>
> **What this repo is:** a **framework-agnostic AI-chat library** — vanilla Web
> Components (`@aparte/core`) + framework wrappers + opt-in providers/plugins.
> Publishable, backend-agnostic. It talks to any LLM through a **transport**:
> `AparteDirectTransport` (browser-direct, BYOK/local) or `AparteBackendTransport` (your
> `/api/chat`, key stays server-side).
>
> **What this repo is NOT:** the product. A privacy-first, 100%-in-browser
> assistant that consumes `@aparte/*` from npm **lives in its own separate repo**.
> The local-first / offline promise is the **product's**, never the library's.
> No routing, settings, or persistence here.
>
> Repo type: **NX monorepo + pnpm workspaces**. Default branch: `main`.

---

## 🎯 Karpathy principles — apply to every task

1. **Think before coding.** Plan in 3-4 lines first (problem, approach, what changes,
   what doesn't) before opening files.
2. **Simplicity first.** 30 lines of dumb code over 300 of clever abstraction. Reuse
   existing primitives. New layer **only** when duplication crosses 3 places.
3. **Surgical changes.** One concern per commit. No drive-by refactors.
4. **Goal-driven.** Every change ties to a user-visible behavior or a measurable metric
   (bundle size, latency, test pass). No "beautification" PRs.

---

## 🏗️ The cut — what lives here

```
apartejs/
├── apps/
│   ├── docs/                 Starlight (Astro) — EN-first, docs + live showcase
│   └── examples/             react · vue · svelte · angular · vanilla (+ vanilla-dist)
├── e2e/                      Playwright browser smoke tests — drives the examples
├── packages/
│   ├── core/                 @aparte/core     — vanilla TS web components, ZERO deps
│   ├── engine/               @aparte/engine   — runStreamAgent + parity suites
│   ├── locales/              @aparte/locale-fr   (EN = core's built-in APARTE_DEFAULT_LOCALE)
│   ├── providers/            @aparte/provider-{openai-compat, ai-sdk, transformers}
│   ├── plugins/              @aparte/plugin-{marked, streaming-markdown, shiki,
│   │                         model-selector (light), ask-user}
│   └── wrappers/             @aparte/{react, vue, svelte, angular}
└── nx.json
```

**Mental model**
- `@aparte/core` = the *engine surface* (web components, no framework, no deps).
- `@aparte/engine` = the agent loop (`runStreamAgent`) that core can drive via a seam.
- `providers/*` = pluggable LLM adapters (wire-format only; consumer opts in).
- `wrappers/*` = thin framework bridges (React/Vue/Svelte/Angular).

**Out of scope** (added only on real demand): the consuming product app, the
markdown/highlight micro-packages, an eval harness, voice.

**Deferred, with the trigger that would start them** — each was reasoned through and
put down on purpose, so a future session does not re-derive the answer from scratch:

- **Citations.** Not a segment, and not markdown either. When a model writes
  `[source](url)` it is markdown and the plugin already renders it; when a provider
  attaches them (Anthropic's `citations` on a content block, an `url_citation`
  annotation with character offsets) they are **annotations on a range of a text
  segment** — a shape neither a block nor a link can carry. So the field would go on
  `AparteTextSegment` (or in its `meta`), never in the type union. *Trigger: a provider
  in this repo that actually returns them.* Today none does — `openai-compat` is
  chat-completions, `ai-sdk` passes through, `transformers` is local — so it would be a
  contract maintained for nobody (decision #7).
- **A code-interpreter / shell plugin.** The thing every product calls "a terminal" is
  a **tool call**: the model emits a call whose arguments are code, and the client
  renders the *result*. So it is a tool plus a tool renderer, the shape
  `@aparte/plugin-ask-user` already proves — and the tool's NAME belongs to the app
  (`bash`, `python`, `run_command`), never to core, because that is wire-format
  knowledge. *Trigger: wanting the human-approval gate demonstrated end to end, which
  is what such a tool would give it.* The `terminal` segment that used to stand in for
  this was removed rather than kept: nothing emitted it, and its `exitCode` /
  `isRunning` fields were the signature of an app that owned the execution.
- **Grouping consecutive tool calls** behind one "3 tools used" line, the way
  assistant-ui's `ToolGroup` does. Two reasons to wait. It is not a renderer change: a
  group spans SEGMENTS, so the bubble would have to notice that 3, 4 and 5 are all tool
  calls and wrap them — a change in the most load-bearing composition path in core, for
  a presentational nicety. And the row redesign removed most of its motivation: grouping
  exists to tame visual noise, and the row is one quiet ~22px line where the old chip was
  a bordered, colour-filled badge, so five of them is five quiet lines rather than a wall.
  *Trigger: a real turn whose consecutive calls actually make the transcript unreadable —
  measured on a page, not imagined.*
- **Exporting the tool-row builders** so the default becomes a composable kit
  (`buildToolRow` + the Input/Output parts) rather than only a good default. Measured
  against the rule in #7 rather than assumed: the one in-repo consumer of
  `registerToolRenderer` is `@aparte/plugin-ask-user`, and it REPLACES the row with a
  receipt card, so it would not call such a builder. A layer no in-repo caller uses is a
  contract maintained for nobody. *Trigger: a consumer that wants the default row with a
  body of its own — which is the request to listen for, since it is the one thing
  `registerToolRenderer` cannot do today without copying core's markup.*

---

## 🛠️ Stack

| Layer        | Tool                              | Why                                  |
|--------------|-----------------------------------|--------------------------------------|
| Monorepo     | NX + pnpm workspaces              | Incremental builds, workspace deps   |
| Lang         | TypeScript (strict; → strictest)  | Type safety                          |
| Engine       | Vanilla web components            | Framework-agnostic, zero deps        |
| Bundler      | Vite + tsc emit-decl-only         | ESM-only (browser-first)             |
| Tests        | Vitest                            | Root `vitest.workspace`              |
| Docs         | Starlight (Astro)                 | EN-first, docs + live showcase       |
| Wrappers     | React / Vue / Svelte / Angular    | each **peer + dev only**             |

---

## 🔒 Ratified decisions (revocable until first publish)

1. **Render hooks** return `HTMLElement | string` (generalized AvatarProvider pattern).
2. **Bubble**: both paths — `SyncableBubble` (full replacement, exists) + fine-grained
   hooks (`renderBubbleShell`/`renderAttachment`/`renderSiblingNav`) in V0.1.
3. **Action registries** (composer/bubble) **merged** — one registry, zone parameter.
4. **Wrapper slot parity — reached, then simplified.** `empty-state`, `above-composer` and
   one `toolbar` exist on **all four** wrappers (props in React, named slots elsewhere). Two
   things were learned getting there. (a) The parity had been reached long before this line
   said so — a decision list that describes the code has to be re-measured, not trusted.
   (b) The row used to be three POSITIONAL slots (`footer-left/center/right`) in three
   syntaxes, and they were cited in one clause of one enumeration on a page the first external
   consumer had read: he built a bar of his own under the chat rather than find them, and the
   JSDoc naming his exact case solved it the second he saw it. Hence the rule this line now
   carries: **a capability cited in passing, with no example, is functionally invisible** — it
   ships documented with a code block or it ships undiscovered (see the reachability/weight
   halves in #9). The positional names went with it: no chat library exposes left/right, CSS
   itself moved to logical properties, and a name that a right-to-left locale contradicts is a
   name that will lie. Placement is now the DOM order plus `margin-inline-start: auto`.
5. **Docs EN-first** (FR is a post-launch port). Both `locale-en`/`locale-fr` packages
   stay — that's data, not docs.
6. **`_streamLoop` inline in core: KEPT** as the standalone default ("core works without
   engine" story). Engine via the seam = recommended path. Parity proven by the engine
   suite, not duplicated in maintenance.
7. **Raw-prompt / prefix-cache serialization = a future `providers/*`, NOT a core or engine
   primitive.** The loop half is done (`StreamRunOptions.onHistoryAppend` lets the caller own
   the history, so a prefix-cache host — llama.cpp slots, vLLM — can drive the engine today).
   What is deliberately NOT in the library is rendering a tool inventory / calls / results into
   a **raw prompt**: that is per-model-family chat-template knowledge, i.e. wire format, and
   wire format lives in a provider (anti-pattern #1). Two apps have written their own
   (monaparte, bonaparte) and both target the same family, so a third duplication would teach
   nothing new — but no provider **in this repo** would consume such a serializer today
   (openai-compat and ai-sdk are message APIs, transformers has its own template), and a layer
   with no in-repo consumer is a contract maintained for nobody. The trigger to build it is
   shipping a raw-completion provider (`provider-llamacpp`), which gives it a consumer, a test
   surface (byte-stable prefix across turns) and a home — not a duplication count.
8. **A visible affordance core cannot honour end-to-end is not enabled by default.** Three
   tiers decide it: (a) honoured by core alone → **on** (`copy`, the `‹1/2›` picker, the
   waiting indicator, the stop button, the model selector); (b) honoured only by an optional
   host — `AparteClient` or an app listening for the event → **off**, with one lever to turn
   it on (`setBubbleActions` for the action bar, `setHostHandlers` for everything else);
   (c) rendered only inside content the app produced (segments) → follows (b): a model
   emitting a terminal segment does not mean the app can run the command. `aparte-send` is
   the deliberate exception — without a host nothing answers a send either, but that is the
   primary function, and the failure is immediate and visible to the *developer*, not a lie
   told to the user. An undeclared affordance is not half-rendered either: no role, no tab
   stop, no pointer. The rule was discovered the hard way — attachments were made opt-in in
   0.4.0 for exactly this reason, and the sweep that followed found six more cases, none of
   which our own examples handled.
9. **A capability is never hostage to `AparteClient`, and never hostage to a bundle.**
   Two halves of the same rule, both learned from the first external consumer:
   (a) *reachability* — every capability ships as a standalone function
   (`setupMarkedProvider`, `setupShikiProvider`, `registerDefaultRenderers`, and the
   built-ins that now install themselves), because the guide that says "bring your own
   loop" cannot then require the object it told you not to construct; the client is one
   caller of a capability, never its gatekeeper. Corollary: make the wiring
   *introspectable* (`renderMarkdown`, `hasHighlightProvider`,
   `createStreamingMarkdownRenderer` returning `null`) so a consumer can test its setup
   in Node, without a DOM. (b) *weight* — a consumer must be able to control what a
   plugin makes their bundler emit. Runtime laziness is not distribution weight: a
   static import of a full grammar bundle costs every consumer 302 chunks whatever the
   options say, so the lever is a **separate entry point**
   (`@aparte/plugin-shiki/core`), not a flag. Measure before claiming either.

---

## ⚠️ Anti-patterns (don't)

1. **No deps in `@aparte/core`.** The zero-dep promise. Need markdown/highlight/etc.?
   → a `providers/*` or `plugins/*` the consumer opts into.
2. **No framework at the ROOT.** Angular/React/Vue/Svelte live **only** in their own
   wrapper package (peer + dev) and their example. Root = pnpm + NX + TS + vitest +
   changesets, period. Never let a framework leak into the root.
3. **No product logic here.** Routing, settings, persistence belong to the product.
   Core stays presentational + transport-agnostic.
4. **`workspace:*`** for every cross-package dep in `package.json`.
5. **Don't rebuild what nx caches.** Use `nx run`, not raw scripts, when a target exists.

---

## 📜 Commands

```bash
pnpm install                 # bootstrap
pnpm build                   # all packages
pnpm test                    # vitest run (root)
pnpm e2e                     # browser smoke E2E (Playwright; run `pnpm e2e:install` once first)

nx build @aparte/core
nx test  @aparte/core
nx affected:test             # when touching shared packages
nx affected:build

pnpm run docs                # apps/docs (Starlight dev) — `run` required: bare `pnpm docs` hits npm's builtin `docs` command (opens the browser), which shadows the script
```

---

## ✅ Conventions & before you ship

- **`pnpm gate` at the end of a lot, not per commit** — and `pnpm gate:full` (adds
  `pnpm e2e`) before anything reaches `main`, always. The gate is now 30 steps, 23 of them
  `check:*` guards (count them, don't trust this line:
  `node -e "const g=require('./package.json').scripts.gate.split('&&'); console.log(g.length, g.filter(s=>/pnpm check/.test(s)).length)"`):
  a full build, coverage with per-glob floors, `publint`/`attw` on 15
  packages, the docs site build and a link check over the built pages. Running it 25 times
  in one session is most of the session, and it re-verifies the same thing 25 times.
  What actually protects each commit is the hooks: **pre-commit** runs lint + typecheck,
  **pre-push** runs test + build and refuses a direct push to `main`. Gate when a lot is
  done, when a guard is added, or when you have touched a generated artifact — and always
  before the merge. `--no-verify` is never the answer; feature work goes on a branch + PR.
- **Conventional commits**, one concern per commit. Tests green before each commit — the
  cheap check (`pnpm test`, or `nx test <project>`) is enough per commit; the gate is for
  the lot.
- **Never commit** `dist/`, `*.tsbuildinfo`, or `.claude/` — gitignored from day 1.
  Stage explicit files; don't `git add -A`.
- **No `Co-Authored-By` trailer.** Commit messages carry no attribution trailer of any
  kind — this line used to require one, which is why it kept coming back.
- `pnpm test` passes; `nx affected:build` for touched package(s) succeeds.
- Don't add `console.log` in `packages/core/` — now an eslint rule rather than a habit
  (`warn` and `error` stay allowed: core uses them to tell a developer their setup is
  incomplete).
- **A built-in's CSS goes in `packages/core/src/styles/`, never in a
  `getStyles()` template literal.** Eleven sheets there. `theme.css` holds every token —
  light palette, dark overrides, derived layer — and ten more hold the rules, one per
  family: `base`, `shell`, `bubble`, `composer`, `segment`, `artifact`,
  `elicitation`, `conversation`, `prose`, `responsive`. You open one to change a value
  and another to change a look, and `aparte.css` no longer exists.

  **The import ORDER in `src/index.ts` is the cascade**, so a new sheet is not appended
  casually: `responsive` stays last because it overrides, and everything that reads the
  sheets reads them in that same order — `check:derived-vars`, `gen-css-vars` and the
  test helper `src/__tests__/read-stylesheet.ts`. All three located their corpus by a
  single PATH before the split and all three went blind on it the same hour: the
  generator reported 6 declared tokens instead of 286, and three suites went red. Each
  carries a floor now, because a corpus that silently shrinks is the failure worth
  catching. The `getStyles()` seam exists for a *consumer's* renderer, which
  cannot edit any of them and has no other way onto the page. Two measured reasons, not
  three: `check:derived-vars` reads only those sheets, so a derived declaration hidden in
  a renderer is unchecked; and CSS in a template literal is not read as CSS — a backtick
  closes the literal (it happened four times, once in the artifact card long before) and
  a `//` comment is just text, which is how a `safe-text` marker ended up rendered in an
  assistant's bubble. The reason that does *not* hold: reaching the generated CSS
  reference. `gen-css-vars.mjs` walks all of core's source, so a knob read from a `.ts`
  was already listed with its fallback as the default. (I first wrote that the move
  changed the generated file "by zero lines" — measured with `git diff` on a file
  `apps/docs/.gitignore` untracks, so it could not have shown anything. It did change:
  the "Read by" column moves. The claim it supports stands on the generator's own walk
  of `CORE_SRC`, not on that diff.)
- **Every class core emits is prefixed `aparte-`.** There was no written policy, which is
  exactly how it drifted: 146 prefixed component classes against 42 bare renderer ones.
  Core is light DOM on purpose, so the bleed goes both ways, and the outward one is the
  serious one — the rules were bare global selectors (`.error-message { }`), so importing
  the package restyled a host's own error messages. Inbound has already bitten us twice: a
  bare `nav` rule on this repo's own docs site moved the artifact card's tabs, and
  `.segment` is Semantic UI's base class. One deliberate exception: `language-*` on a code
  block stays unprefixed, because that is the name highlighters look for.
- A changeset entry for any package with an API/CSS change.
- **A new package or feature lands behind a green gate**: tests + build + publint + a docs page
  (+ browser E2E via `pnpm e2e` for anything touching the framework boundary / rendering).
- Bundle-size-sensitive change? Check the `@aparte/core` size delta (badge must stay honest).

---

## 📚 Reference

- The generated CEM (custom-elements manifest) is the source of truth for the component API, surfaced in the Starlight docs.
- The **customization charter** (106 regions, LAUNCH / V0.1 / on-demand priorities) is the
  design spec; its LAUNCH scope is expressed in-repo via the generated CEM + a public
  "Customization" docs section — not copied wholesale.
