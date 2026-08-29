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
│   └── examples/             react · vue · svelte4 · svelte5 · angular · vanilla (+ vanilla-dist)
├── e2e/                      Playwright browser smoke tests — drives the examples
├── packages/
│   ├── core/                 @aparte/core     — vanilla TS web components, ZERO deps
│   ├── engine/               @aparte/engine   — runStreamAgent (the loop, nothing else)
│   ├── locales/              @aparte/locale-fr   (EN = core's built-in APARTE_DEFAULT_LOCALE)
│   ├── providers/            @aparte/provider-{openai-compat, ai-sdk, transformers}
│   ├── plugins/              @aparte/plugin-{marked, streaming-markdown, shiki,
│   │                         model-selector (light), ask-user, approval, compaction}
│   ├── tools/                @aparte/docs-mcp — the docs as an MCP server (Node, not in the lib)
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
- **The artifact rework (D7) — DONE 2026-08-29.** It was a bidirectional app protocol
  living beside the segment system (file-gen events the app dispatched,
  redownload/rehydrate, a preview builder, a binary cache, three ingestion modes, a
  built-in the engine executed outside any policy). It is `@aparte/plugin-artifacts`
  now, end to end: a real `create_artifact` tool, the card as a tool renderer on its
  structured result, the `<artifact>` grammar registered on the parser through
  `registerStreamBlock`, the same card as the segment renderer, and `onBinary` in place
  of the event handshake. Core keeps nothing artifact-shaped — what it gained is
  generic: the block-grammar seam (`registerStreamBlock`, the model conventions
  `<think>`/`<artifact>`/`<file>`/`<cite>` are one shape), `AparteToolRenderer.update`,
  and one rule in the history serializer (an unknown type contributes its `content`,
  else its `fallback`). Paul's second correction set the line — "la reconnaissance doit
  être plugin": not even the tag is core's.

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
6. **ONE agent loop — revised 2026-08-28 (D1).** This line used to keep `_streamLoop`
   inline in core beside engine's `runStreamAgent`, on the premise "parity proven by the
   engine suite, not duplicated in maintenance". The audit falsified the premise: the
   same `create_artifact`+tool turn corrupted the history in TWO different shapes, one
   per loop, invisible to the parity suite precisely because they differ; ~20 "mirrors
   `_streamLoop`" comments; every loop fix landed twice. Decision: the stream types move
   down into engine (the mirror contract dies), core depends on engine (first-party,
   zero third-party deps — the badge is reworded, the principle is untouched), the
   inline loop is deleted and the adapter path — already proven equivalent — becomes THE
   path. "Core works without engine" survives at the install level (npm resolves it),
   not at the package-graph level. Executed in Lot C (`.claude/audit-2026-08-28.md` §6).
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
10. **The audit-night decisions (2026-08-28, D2–D7)** — taken against three criteria:
    the norm, the greatest number of consumers, agnosticism. Detail and evidence in
    `.claude/audit-2026-08-28.md` §5.
    - **D2** — the `_meta` channel is trimmed: `pipeline`, `artifactRaw`, `artifactXml`
      leave core (orchestration belongs to the product; the parser's native `<artifact>`
      path is the one path); `artifactHint` and `prefixSegments` stay AND get documented.
      `_meta` itself stays an open namespaced bag.
    - **D3** — the storage contract loses `memory`, `gallery` and `settings` (product
      schema; an adapter is the consumer's class and can carry its own methods). It keeps
      conversations and `AparteAttachmentRow`.
    - **D4** — the skeleton JS seam dies (`setSkeletonProvider` / `getSkeleton`, no
      consumer); the `.aparte-skeleton` CSS recipe stays in the display layer.
    - **D5** — `aparte-send` declares `modelId`/`providerId` (per-message model override).
    - **D6** — two legacies drop, as renames: the bubble's `role` attribute as message role
      (`data-role` only) and the viewport's `maxMessages` alias.
    - **D7** — the artifact rework: converge toward the tool/renderer seam (an artifact is a
      tool result rendered richly). Executed 2026-08-29 as `@aparte/plugin-artifacts` — see
      the "Deferred" list above for what core kept (a generic seam) and what left (all of it).

---

## ⚠️ Anti-patterns (don't)

1. **No third-party deps in `@aparte/core`.** The zero-dep promise — `@aparte/engine` is
   the one dependency, first-party (D1). Need markdown/highlight/etc.?
   → a `providers/*` or `plugins/*` the consumer opts into.
2. **No framework at the ROOT.** Angular/React/Vue/Svelte live **only** in their own
   wrapper package (peer + dev) and their example. Root = pnpm + NX + TS + vitest +
   changesets, period. Never let a framework leak into the root.
3. **No product logic here.** Routing, settings, persistence belong to the product.
   Core stays presentational + transport-agnostic.
4. **`workspace:*`** for every cross-package dep in `package.json`.
5. **Don't rebuild what nx caches.** Use `nx run`, not raw scripts, when a target exists.
6. **No product schema in a public contract.** A field whose JSDoc names a feature this
   library does not have ("the memory panel", "the orchestrator", "the gallery") is the
   product's schema wearing a `@aparte` type. Same family as #3, on the TYPES side — it
   is how `AparteMemoryFact` and the `_meta` pipeline got in. Before exporting anything,
   the three review questions: which seam? which in-repo consumer exercises it? honoured
   end to end? (`.claude/philosophie-agnosticite.md` §3.)

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
  `getStyles()` template literal.** Forty-three sheets there, one family each — count
  them, don't trust this line:
  `node -e "const s=require('fs').readFileSync('packages/core/src/index.ts','utf8');console.log((s.match(/^import '\.\/styles\//gm)||[]).length)"`.
  `theme.css` holds every token (light palette, dark overrides, derived layer);
  `button`/`field` hold the two control recipes; `display/` and `surface/` the rest of
  the neutral layer; `primitives/`, `segment/` and `components/` what core itself
  renders. You open one to change a value and another to change a look, and
  `aparte.css` no longer exists.

  **The import ORDER in `src/index.ts` is the cascade** — and it is now the SOURCE of
  that order, not a copy of it. Five readers each kept their own list and every one of
  them drifted: `check:derived-vars`, the docs' `gen-css-vars`, the test helper
  `src/__tests__/read-stylesheet.ts`, the landing page's variable count, and
  `styles/bundle.css`. Four now derive the list from the import block via
  `scripts/core-stylesheets.mjs`; `bundle.css` cannot (a bundler reads it as CSS) so
  `check:derived-vars` asserts it matches, import for import. Each also carries a floor,
  because a corpus that silently shrinks is the failure worth catching — the generator
  once reported 6 declared tokens instead of 286, and `bundle.css` had quietly fallen a
  sheet behind with no symptom but the docs site rendering without it. `responsive`
  stays last because it overrides. The `getStyles()` seam exists for a *consumer's*
  renderer, which
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
- **A component wears the recipe; it does not redraw it.** `aparte-btn`, `aparte-field`,
  `aparte-tag`, `aparte-checkbox`, `aparte-radio`, `aparte-icon` and the rest of the
  neutral layer own shape, spacing, states and focus. What a component adds is only what
  is genuinely its own — where it floats, the scrim it needs over a picture. Three rules
  follow, each learned by breaking it:
  - **Declare the recipe's token, don't out-specify the recipe.** `.aparte-composer-row`
    sets `--aparte-btn-size`; it used to be `.aparte-composer-row button`, a type
    selector, which also hit every button in a panel mounted inside that row. Its
    antidote in `base.css` had the same specificity, so which won came down to two
    imports, and splitting the sheets flipped it — the approval options came back as
    44×44 squares with their labels spilling out. A declaration only the intended reader
    can see needs no antidote and cannot be re-broken by a re-ordering.
  - **A per-component token that resolves to what the recipe already gives is an alias,
    not a knob.** The scroll button declared `--aparte-scroll-btn-bg: var(--aparte-surface-1)`,
    `-color: var(--aparte-text)`, `-border: var(--aparte-border)` and a hover to match:
    four names for exactly what `aparte-btn--surface` is. Core is light DOM, so a
    consumer can always write `.aparte-scroll-btn { … }` — a named knob earns its keep
    only when it parameterises something a selector cannot reach.
  - **A documented `@cssprop` must be read by a stylesheet.** When a component stops
    drawing its own radius and lets the recipe draw it, the component's token loses its
    last reader and stays in the JSDoc — so the generated page keeps offering a knob that
    does nothing. Ten had gone that way in one evening. `check:derived-vars` now refuses
    it; the fix is to feed the recipe (`--aparte-btn-radius: var(--aparte-radius-send-btn)`),
    not to delete the documentation.
- **Every glyph lives in `packages/core/src/icons/`, and carries no size.** Scattering
  SVG did not merely spread the source around, it let it DRIFT: three different ✕, two
  chevrons, `paperclip` and `scrollDown` duplicated byte for byte. A glyph carrying
  `width="14"` cannot also be the glyph a 12px slot needs, which is how that happened —
  size is `--aparte-icon-size` (or `--aparte-btn-icon-size` inside a button, which
  out-specifies it), declared by the container. `glyphs.ts` is the set core draws and
  doubles as the icon-provider keys; `extended.ts` is behind `@aparte/core/icons`,
  because the fallback record is read by a computed key and therefore ships whole.
- **One keyframe per motion, prefixed.** Four did a 360° turn (three identical, plus an
  unprefixed `tool-spin` nothing used and which could shadow a consumer's own rule).
  They live in `base.css` beside their consumers, since distance is how they multiplied.
  `check:derived-vars` refuses a duplicate, a dead one, an unprefixed one, and an
  `animation` naming a keyframe that does not exist — that last one is total silence:
  `aparte-icon-spin` was on the loading glyph and declared nowhere, so it simply sat still.
- **An empty state renders no chrome, and a recipe lives in the display layer.** Three
  lessons of the UI audit (2026-08-28, `.claude/audit-2026-08-28.md` §8): a turn with
  nothing to show paints neither name nor time (a tool-only turn, a turn stopped before
  its first token — both left an orphan header); a markdown table is prose and
  `prose.css` styles it like the rest (the sanitizer allowlisted tables that no sheet
  drew); and a tile recipe (`aparte-thumb…`) belongs in `display/`, never in a
  component's sheet — `composer.css` owned it and the bubble, which emits the same
  classes, rendered its file chips bare.
- A changeset entry for any package with an API/CSS change — and **its first line is the
  change, for the caller, at the top**: plain, imperative, no metaphor, scannable in one
  pass. Everything else (the reasoning, the measurement, the history) goes below it. None
  of it is cut; it is ordered, so a reader who needs only the first line does not pay for
  the rest. A changeset becomes the CHANGELOG entry which becomes the GitHub Release body,
  and that reader has ten seconds and one question: *do I have to touch my code?* The
  failure mode here is not vagueness, it is **elegance** — `A panel says whether the
  composer's button has an act, and a single choice settles on the click` is accurate,
  compact, and has to be read twice, where `Single-choice questions now answer on the
  click; there is no submit button to press` lands on the first. The same care that makes
  the work good is what makes it hard to skim, and only the order fixes it. Full rule in
  `CONTRIBUTING.md` → *How a changeset reads*.
- **A new package or feature lands behind a green gate**: tests + build + publint + a docs page
  (+ browser E2E via `pnpm e2e` for anything touching the framework boundary / rendering).
- Bundle-size-sensitive change? Check the `@aparte/core` size delta (badge must stay honest).

---

## 📚 Reference

- The generated CEM (custom-elements manifest) is the source of truth for the component API, surfaced in the Starlight docs.
- The **customization charter** (106 regions, LAUNCH / V0.1 / on-demand priorities) is the
  design spec; its LAUNCH scope is expressed in-repo via the generated CEM + a public
  "Customization" docs section — not copied wholesale.
- **The current audit and its lots live in `.claude/audit-2026-08-28.md`** (gitignored):
  findings with line references, decisions D1–D7 (§5), the three lots A/B/C (§6), the UI
  audit (§8), the repo-hygiene findings (§9) and the night journal (§11). Its siblings:
  `.claude/marche-2026-08-28.md` (the market), `.claude/roadmap-v1.md` (components,
  plugins, the alpha→beta and beta→v1 gates), `.claude/philosophie-agnosticite.md` (the
  seven agnosticism axes and the doctrine). A session that picks up a lot reads the
  audit file first.
