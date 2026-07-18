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
> **What this repo is NOT:** the product. The privacy-first, 100%-in-browser
> assistant that used to live beside the library (*home*) **stays in its own repo**
> and consumes `@aparte/*` from npm. The local-first / offline promise is the
> **product's**, never the library's. No routing, settings, or persistence here.
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

**Out of scope** (added only on real demand): the product *home*, the markdown/highlight
micro-packages, `eval/`, voice.

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
4. **Wrapper slot parity** (footer-left/center/right + above-composer on React/Vue/Svelte,
   today Angular-only) → **at LAUNCH**.
5. **Docs EN-first** (FR is a post-launch port). Both `locale-en`/`locale-fr` packages
   stay — that's data, not docs.
6. **`_streamLoop` inline in core: KEPT** as the standalone default ("core works without
   engine" story). Engine via the seam = recommended path. Parity proven by the engine
   suite, not duplicated in maintenance.

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

pnpm docs                    # apps/docs (Starlight dev)
```

---

## ✅ Conventions & before you ship

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
