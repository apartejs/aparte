# CLAUDE.md — aparte

> **aparte** — scope `@aparte`, GitHub org `apartejs`, pronounced *"ah-par-té"* (French
> *aparté*: a line spoken aside; a private word taken "in aparte"). Bonus EN reading:
> *a part* = one composable piece.
>
> **What this repo is:** a **framework-agnostic AI-chat library** — vanilla Web
> Components (`@aparte/core`) + framework wrappers + opt-in providers/plugins.
> Publishable, backend-agnostic. It talks to any LLM through a **transport**:
> `DirectTransport` (browser-direct, BYOK/local) or `BackendTransport` (your
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
│   └── playgrounds/          react · vue · svelte · angular · vanilla (+ demo-vanilla)
├── e2e/                      Playwright browser smoke tests — drives the playgrounds
├── packages/
│   ├── core/                 @aparte/core     — vanilla TS web components, ZERO deps
│   ├── engine/               @aparte/engine   — runStreamAgent + parity suites
│   ├── locales/              @aparte/locale-fr   (EN = core's built-in DEFAULT_LOCALE)
│   ├── providers/            @aparte/provider-{openai-compat, ai-sdk, transformers}
│   ├── plugins/              @aparte/plugin-{marked, streaming-markdown, shiki,
│   │                         model-selector (light), ask-question}
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
   which our own playgrounds handled.
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
   wrapper package (peer + dev) and their playground. Root = pnpm + NX + TS + vitest +
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

- **`pnpm gate` before every commit** (lint · typecheck · test · build · packaging);
  `pnpm gate:full` adds `pnpm e2e` — required for anything touching the framework boundary
  or rendering. Git hooks in `.githooks/` enforce the halves automatically (pre-commit:
  lint+typecheck, pre-push: test+build **and no direct push to `main`**). `--no-verify` is
  never the answer; feature work goes on a branch + PR.
- **Conventional commits**, one concern per commit. Tests green before each commit.
- **Never commit** `dist/`, `*.tsbuildinfo`, or `.claude/` — gitignored from day 1.
  Stage explicit files; don't `git add -A`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- `pnpm test` passes; `nx affected:build` for touched package(s) succeeds.
- Don't add `console.log` in `packages/core/`.
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
