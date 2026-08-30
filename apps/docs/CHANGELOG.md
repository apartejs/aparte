# @aparte-workspace/docs

## 0.0.19

### Patch Changes

- Updated dependencies [9406f16]
  - @aparte/core@0.16.3
  - @aparte/locale-fr@0.16.3
  - @aparte/plugin-shiki@0.16.3

## 0.0.18

### Patch Changes

- Updated dependencies [705224b]
- Updated dependencies [9df343c]
- Updated dependencies [39b777f]
  - @aparte/core@0.16.2
  - @aparte/locale-fr@0.16.2
  - @aparte/plugin-shiki@0.16.2

## 0.0.17

### Patch Changes

- Updated dependencies [4040ba9]
- Updated dependencies [6a786c3]
- Updated dependencies [3b5ab3e]
- Updated dependencies [9f9f13d]
- Updated dependencies [6484a3c]
  - @aparte/core@0.16.1
  - @aparte/locale-fr@0.16.1
  - @aparte/plugin-shiki@0.16.1

## 0.0.16

### Patch Changes

- Updated dependencies [99da790]
- Updated dependencies [41aaee8]
- Updated dependencies [bec58ff]
- Updated dependencies [7be58c9]
- Updated dependencies [45574cd]
- Updated dependencies [4123389]
- Updated dependencies [22fe79e]
- Updated dependencies [22fe79e]
- Updated dependencies [22fe79e]
- Updated dependencies [22fe79e]
- Updated dependencies [4123389]
- Updated dependencies [5e0c4e7]
- Updated dependencies [5e0c4e7]
- Updated dependencies [4123389]
- Updated dependencies [3a0f593]
- Updated dependencies [a7528d1]
- Updated dependencies [95613d0]
- Updated dependencies [95613d0]
- Updated dependencies [95613d0]
- Updated dependencies [4a508e4]
- Updated dependencies [9eccccc]
- Updated dependencies [00126e3]
- Updated dependencies [08bbdae]
- Updated dependencies [81d0b54]
- Updated dependencies [3590e4a]
- Updated dependencies [3590e4a]
- Updated dependencies [3590e4a]
- Updated dependencies [3c2e507]
- Updated dependencies [3c2e507]
- Updated dependencies [3c2e507]
- Updated dependencies [3c2e507]
- Updated dependencies [575ec7e]
- Updated dependencies [3a0f593]
- Updated dependencies [4a508e4]
- Updated dependencies [5e0c4e7]
- Updated dependencies [3a0f593]
- Updated dependencies [a7528d1]
- Updated dependencies [575ec7e]
- Updated dependencies [33c62b5]
- Updated dependencies [ecd50e2]
- Updated dependencies [ef6913c]
- Updated dependencies [1b1a715]
- Updated dependencies [4123389]
- Updated dependencies [8b1a1d8]
- Updated dependencies [e4b1fbe]
- Updated dependencies [e4b1fbe]
- Updated dependencies [bc75c30]
- Updated dependencies [d67fa45]
- Updated dependencies [32762be]
- Updated dependencies [fb14521]
- Updated dependencies [0556897]
- Updated dependencies [6ba8397]
- Updated dependencies [c546d09]
- Updated dependencies [9a29df6]
- Updated dependencies [d284c7e]
- Updated dependencies [4b8bd15]
- Updated dependencies [ea6fe97]
- Updated dependencies [0e20e36]
- Updated dependencies [2f8fa7c]
- Updated dependencies [99f7e4a]
- Updated dependencies [259e785]
- Updated dependencies [ebe003e]
- Updated dependencies [1a9da39]
- Updated dependencies [4e04443]
  - @aparte/core@0.16.0
  - @aparte/locale-fr@0.16.0
  - @aparte/plugin-shiki@0.16.0

## 0.0.15

### Patch Changes

- Updated dependencies [4856ab6]
  - @aparte/core@0.15.1
  - @aparte/locale-fr@0.15.1
  - @aparte/plugin-shiki@0.15.1

## 0.0.14

### Patch Changes

- Updated dependencies [7502ed0]
- Updated dependencies [4590cbe]
- Updated dependencies [4b73f83]
- Updated dependencies [06e028b]
  - @aparte/core@0.15.0
  - @aparte/locale-fr@0.15.0
  - @aparte/plugin-shiki@0.15.0

## 0.0.13

### Patch Changes

- Updated dependencies [9c4ef91]
- Updated dependencies [e58508a]
- Updated dependencies [d22a75d]
- Updated dependencies [ea6cfe0]
- Updated dependencies [d45da0c]
- Updated dependencies [461a692]
- Updated dependencies [64f679a]
- Updated dependencies [9c4ef91]
- Updated dependencies [04289bb]
- Updated dependencies [4bde588]
- Updated dependencies [213add8]
- Updated dependencies [e083712]
- Updated dependencies [129e094]
- Updated dependencies [1589baa]
- Updated dependencies [f9cac24]
- Updated dependencies [0850dee]
- Updated dependencies [cd5075e]
- Updated dependencies [e3d0006]
- Updated dependencies [95c390d]
- Updated dependencies [2c67b6b]
- Updated dependencies [16464cd]
- Updated dependencies [9cf00bb]
- Updated dependencies [8d07938]
- Updated dependencies [a57ad06]
- Updated dependencies [1412c54]
- Updated dependencies [1412c54]
- Updated dependencies [e413352]
- Updated dependencies [8da979c]
- Updated dependencies [f9a6fbd]
- Updated dependencies [1f654b0]
- Updated dependencies [f9b1008]
- Updated dependencies [9592bed]
- Updated dependencies [e58508a]
  - @aparte/core@0.14.0
  - @aparte/locale-fr@0.14.0
  - @aparte/plugin-shiki@0.14.0

## 0.0.12

### Patch Changes

- f7382c8: Fixed: every live preview on the published docs showed "apartejs.dev refused to connect".

  `nginx.docs.conf` sent `frame-ancestors 'none'` and `X-Frame-Options: DENY`, which forbid
  the page from being framed by anyone — its own parent included. The docs site frames
  itself: every preview is an `<iframe>` pointing at `/preview/*`, which is the whole
  mechanism, so core's light DOM is not restyled by the site around it and a responsive
  frame gets a viewport of its own. The two halves of the policy disagreed with each other:
  `frame-src 'self'` let the parent embed, `frame-ancestors 'none'` forbade the child from
  being embedded.

  It never showed in development, where nothing adds these headers.

  Now `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`. Clickjacking from another
  origin is still refused, which is what the headers are for.

- 87ae02f: `pnpm release` no longer re-runs the full gate; it requires CI to have passed on the exact
  commit instead.

  Publishing validated one commit three times: the version PR's CI, `main`'s CI after the
  merge, and `gate:full` again inside `release` — roughly twenty minutes of a maintainer's
  wall clock proving what GitHub had just proved. `prerelease-checks` gained a fourth check
  that asks for the `ci` verdict on `HEAD`'s SHA and refuses when it is red, still running,
  or absent; a missing or unauthenticated `gh` refuses too, rather than waving the release
  through.

  This is stricter than what it replaced, not looser. The old gate ran on a maintainer's
  workstation; CI runs on `ubuntu-latest`, where 0.13.0's POSIX path bug was reachable and a
  Windows gate could never see it. And 0.13.0 was itself published at 22:52 from a commit
  whose CI concluded `failure` at 22:58 — the local gate was green, nothing was watching the
  one that mattered, and the new check would have stopped it twice over.

- 5dd73b4: A Version PR no longer runs the browser suite.

  0.13.0's was 113 files and not one of them was source — package versions, CHANGELOGs, and
  the changesets they consumed — and it still ran a build and 370 browser tests across seven
  example apps to prove that a version number does not break a chat. The release paid that
  twice: once on the PR, once on `main` after the merge.

  The `e2e` job still runs and still reports, because it is a required check in main's
  ruleset and a skipped job never reports at all — that would block every release PR
  forever. Only the install, the build and the suite are conditional. The rule is
  "does this diff touch anything a browser could notice": everything except `.changeset/*`,
  `CHANGELOG.md`, and the version-and-peer-floor lines of a `package.json`; a manifest that
  changes for a real reason still counts. It fails open — no base, a first push, an
  unreadable diff, and the suite runs.

- Updated dependencies [73cbbdb]
- Updated dependencies [2391d6d]
- Updated dependencies [3c99726]
- Updated dependencies [655cdb1]
- Updated dependencies [73cbbdb]
- Updated dependencies [f8d4fae]
  - @aparte/core@0.13.1
  - @aparte/locale-fr@0.13.1
  - @aparte/plugin-shiki@0.13.1

## 0.0.11

### Patch Changes

- e06d254: The tail of the cold audit: four smaller things, each verified before it was touched.

  **The streaming dot announced nothing.** The artifact card's pulse was a `<span>` with
  `aria-label="Streaming"` — an ARIA-prohibited attribute on an implicit `generic` role,
  dropped by Chromium and Firefox, and hardcoded English in a card whose own comment claims
  every string was given a locale key. It is `role="img"` with `t('generating')` now, the
  key whose documentation already says it names the waiting state.

  **The reference published six overrides as defaults.** `gen-css-vars` matched `:root` with
  leading whitespace, so the block nested inside `responsive.css`'s
  `@media (prefers-reduced-motion: reduce)` was read as another declaration block: every
  duration appeared twice, the second time claiming a default of `0.01ms`, under an
  unrelated heading. Top-level only now — a nested block is an override, which is why the
  dark theme's is skipped.

  **`<aparte-progress-spinner>` could not be stopped.** Its rotation hardcoded `0.9s`
  instead of reading `--aparte-duration-spin`, so it ignored the reduced-motion reset that
  overrides that token. It turns very slightly faster now (0.7s), which is the price of
  stopping when asked.

  **Two guides contradicted the code.** The elicitation guide's presenter table omitted
  `onSettle` — the only path by which a single-choice answer reaches you — and gave
  `mode()` two values out of three, missing `'none'`. The accessibility guide, on a page
  that states "where a number appears, it was counted", claimed the axe suite runs against
  "all five example apps in Chromium, Firefox and WebKit"; there are seven apps, WebKit
  covers five and Firefox two.

- df29881: Fixed: the CSS-classes reference lost all three of its groups on every Linux build.

  `gen-css-classes.mjs` computed each sheet's `rel` by splitting its absolute path on a
  hardcoded backslash. On POSIX nothing split, so every `match(rel)` returned false and all
  37 sheets fell into the ungrouped tail — the Controls, Display and Surfaces sections and
  their intros simply absent. CI is `ubuntu-latest` and the docs `build` runs `gen` first,
  so every build there published the page that way while the copy committed from Windows
  looked correct. It now splits on `path.sep`; simulated on both separators, the grouping is
  identical (2 / 12 / 5).

  The class floor could not see it: it counts CLASSES, all 323 were still present, and it
  stayed green throughout. A second floor now asserts that every group matched a sheet —
  count what a matcher matched, not only what it found.

- 22d5a4d: The Reference section leads with the core JS API.

  `reference/config.md` and `reference/classes.mdx` both claimed `sidebar.order: 4`, so
  which came first was Starlight's alphabetical tiebreak rather than a decision. The core
  API page is the one a reader arrives for; it takes slot 1.

- 9122983: Every live preview frame shows what it promises.

  An audit photographed all 29 `/preview/*` routes and looked at them. Nine defects, in two
  layers.

  **The frame's own stylesheet (one word, every frame).**
  `PreviewDocument.astro`'s `<style>` was not `is:global`, so Astro scoped it — and the
  markup it styles is injected with `<Fragment set:html>`, which carries no scope class. So
  `body > * + *` compiled to `body > :where(.astro-xxxx) + :where(.astro-xxxx)` and matched
  nothing: the 1rem stacking margin had never applied, in any preview, since the file was
  written. That is the badge, the progress track and the alert flush against each other, and
  three unrelated surfaces touching in the overview.

  **The examples (eight, one root cause).**
  A literal `…` used as documentary shorthand for "your content here". It reads perfectly in
  a code block and draws nothing in an iframe: `/preview/class/icon/` was a blank page, the
  thumbnail preview an empty box beside a box holding three dots, `.aparte-btn--icon` an
  invisible ghost square containing an ellipsis. Two more went with it — a `<details>` with no
  `open`, so the accordion preview showed the single word "Shipping" and no affordance at
  all; and a `<switch>` with no label pressed against its neighbour's text.

  Every replacement glyph is core's own, verbatim from `src/icons/glyphs.ts` (and
  `alertTriangleIcon` from `extended.ts` for the warning alert). Drawing them by hand would
  have made a fourth `copy` and a third `check` — the drift that file exists to end.

  The invariant that produced all of this stays, because it is right: the frame and the code
  block read the same string, so a demo can never drift from the example above it. What
  changes is that the examples are written for both readers.

  Not covered, and worth knowing: only the `/preview/*` routes were photographed, in the
  light theme, at one width, with nothing clicked.

- 9a4fa03: The Reference sidebar's order has one owner instead of six.

  Five of the seven Reference pages are generated, and each generator carried its own
  hardcoded `sidebar.order`. Nobody could see two of them at once, so `engine.md` and
  `icons.md` both claimed 3 and `wrappers.md` claimed nothing — a third of the section was
  arranged by Starlight's alphabetical tiebreak rather than by a decision. The generated
  pages are gitignored, so editing them was never an option either: the `gen` step runs
  inside `typecheck`, which rewrites them before a commit can be made.

  `apps/docs/scripts/reference-order.mjs` is now the only place that decides, and it throws
  on a page it does not know rather than letting one fall back to alphabetical. The order
  reads as the JS API (`config`, `events`), then the styling surface (`css-variables`,
  `classes`, `icons`), then the adjacent packages (`engine`, `wrappers`).

- b12e089: Tabs gets its own entry, the class lists stop claiming classes they do not define, and a menu is menu-width.

  **Tabs had no text and no preview.** `surface/tabs.css` carries the banner that opens the
  whole Surfaces group (`aparté — layered surfaces`), and the generator consumes that as the
  group's intro. A family takes its prose and its live example from a banner named after it
  (`aparte-tabs — …`) — and there was none, so the Tabs family reached the reference page as a
  bare list of class names while its own content was shown as the Surfaces overview. It now
  carries both banners, and the family one demonstrates the two looks (`--underline`,
  `--segmented`) with the panel under them. 19 → 20 live examples.

  **The class lists were not the sheets' own.** The collector matched `.aparte-*` across the
  whole source, comments included, so a class merely NAMED in prose was attributed to the
  sheet that mentioned it: Tabs listed `.aparte-popover`, `.aparte-tooltip` and
  `.aparte-btn--ghost`, none of which it defines. Block comments are now stripped first —
  327 → **325**, and the two that went were phantoms.

  **`.aparte-menu` had a floor and no ceiling**, while `.aparte-popover` — which the same file
  calls "the identical floating list surface" — has carried `max-width: 320px` all along. With
  only a `min-width`, a menu placed as a block child stretched to its container: a dropdown
  spanning the full width of whatever held it. It now has the matching cap and
  `width: max-content`, so it hugs its longest item and stops.

  Also: preview frames get real padding (1rem → 2rem 2.25rem) — every example was pressed
  into the top-left corner, which made a two-tile row read as debris rather than a specimen.
  Left-aligned still, because an example has to lay out the way it will on the reader's page.
  And the tooltip example's anchor gets room above it, so the tooltip is no longer clipped by
  the top of its frame.

- a453df1: `AparteTool.systemPrompt` is now actually sent to the model.

  The field is documented on the type as "System prompt injected automatically when this
  tool is registered — tells the AI when and why to use it", and the tools guide repeats
  it. Nothing anywhere read it: a grep across core, engine and every provider finds only
  the conversation-level `_systemPromptTemplate`, which is a different field.

  The failure was silent in the worst way. The tool still worked — the model receives its
  name and JSON schema either way — so all that went missing was the sentence explaining
  WHEN to reach for it, which is the whole reason the field exists.
  `@aparte/plugin-ask-user` sets one, so a shipped plugin was losing its instructions and
  no test could see it.

  `AparteConfig.resolveToolSystemPrompts()` joins the prompts of every registered tool, in
  registration order, and the client sends them as a system message of their own — after
  the app's template, which stays separate because one is about the app and the other about
  the tools. A tool that sets none contributes nothing, and with no tool setting one there
  is no extra message at all.

  The three turn entry points (send, retry, edit) were each writing the same two lines of
  system-message assembly, so they now share one `_systemMessages()` helper — the shape
  that would otherwise have got the tool half in two of the three.

  Found by a documentation audit. Four tests pin it; reverting the wiring fails three.

- Updated dependencies [e50ca32]
- Updated dependencies [ca49417]
- Updated dependencies [1dff98c]
- Updated dependencies [b011416]
- Updated dependencies [7d11d0b]
- Updated dependencies [e06d254]
- Updated dependencies [67d8e6b]
- Updated dependencies [94b87b7]
- Updated dependencies [705e847]
- Updated dependencies [682a837]
- Updated dependencies [82b842e]
- Updated dependencies [ec309ab]
- Updated dependencies [1d336d1]
- Updated dependencies [7713818]
- Updated dependencies [f0b9141]
- Updated dependencies [1dff98c]
- Updated dependencies [466b849]
- Updated dependencies [96c23c3]
- Updated dependencies [3889d8f]
- Updated dependencies [cbfc72e]
- Updated dependencies [13ec8ca]
- Updated dependencies [4b80eab]
- Updated dependencies [0d68e65]
- Updated dependencies [2bf55e1]
- Updated dependencies [2ed3bc8]
- Updated dependencies [14a55b0]
- Updated dependencies [95de449]
- Updated dependencies [3e2afee]
- Updated dependencies [53d99d8]
- Updated dependencies [a2274be]
- Updated dependencies [a574dfa]
- Updated dependencies [7f4e396]
- Updated dependencies [9a1471e]
- Updated dependencies [61e40da]
- Updated dependencies [aaf8d5c]
- Updated dependencies [b7f5bab]
- Updated dependencies [5cfb818]
- Updated dependencies [e50ca32]
- Updated dependencies [c236992]
- Updated dependencies [8fe68de]
- Updated dependencies [9122983]
- Updated dependencies [9a1471e]
- Updated dependencies [bde11bb]
- Updated dependencies [a8804ee]
- Updated dependencies [b9e1b1b]
- Updated dependencies [8678eaf]
- Updated dependencies [3e2afee]
- Updated dependencies [7f89fc8]
- Updated dependencies [7471fb0]
- Updated dependencies [b12e089]
- Updated dependencies [a8ce9de]
- Updated dependencies [e8506a5]
- Updated dependencies [bc86198]
- Updated dependencies [a453df1]
- Updated dependencies [45a1083]
- Updated dependencies [95fadcc]
  - @aparte/core@0.13.0
  - @aparte/plugin-shiki@0.13.0
  - @aparte/locale-fr@0.13.0

## 0.0.10

### Patch Changes

- Updated dependencies [681bb47]
- Updated dependencies [cd323aa]
  - @aparte/core@0.12.1
  - @aparte/locale-fr@0.12.1
  - @aparte/plugin-shiki@0.12.1

## 0.0.9

### Patch Changes

- Updated dependencies [2ac6080]
- Updated dependencies [2ac6080]
  - @aparte/core@0.12.0
  - @aparte/locale-fr@0.12.0
  - @aparte/plugin-shiki@0.12.0

## 0.0.8

### Patch Changes

- Updated dependencies [7336ae4]
- Updated dependencies [f52dbe9]
- Updated dependencies [e40cf78]
- Updated dependencies [ecd9ad5]
- Updated dependencies [56e1247]
- Updated dependencies [094d438]
- Updated dependencies [02f2d4d]
- Updated dependencies [093a196]
- Updated dependencies [5ac31ff]
- Updated dependencies [e406a98]
- Updated dependencies [6f262cf]
- Updated dependencies [c4d87a2]
- Updated dependencies [c6d3a20]
- Updated dependencies [d85cf6b]
- Updated dependencies [9e30879]
- Updated dependencies [2f6180e]
  - @aparte/core@0.11.0
  - @aparte/locale-fr@0.11.0
  - @aparte/plugin-shiki@0.11.0

## 0.0.7

### Patch Changes

- Updated dependencies [f1fcbb4]
- Updated dependencies [388b594]
- Updated dependencies [b4f2435]
- Updated dependencies [79956cb]
- Updated dependencies [fd192e6]
- Updated dependencies [0fc38d8]
- Updated dependencies [cd188f7]
- Updated dependencies [3f182ef]
- Updated dependencies [494e3dd]
- Updated dependencies [0fed195]
- Updated dependencies [155a619]
- Updated dependencies [9642713]
- Updated dependencies [fbffb48]
- Updated dependencies [88cc99a]
- Updated dependencies [9ac83d4]
- Updated dependencies [fc8a83b]
- Updated dependencies [4ce2ae6]
- Updated dependencies [17d31fb]
- Updated dependencies [7602c8d]
  - @aparte/core@0.10.0
  - @aparte/locale-fr@0.10.0
  - @aparte/plugin-shiki@0.10.0

## 0.0.6

### Patch Changes

- Updated dependencies [216c5f0]
  - @aparte/core@0.9.0

## 0.0.5

### Patch Changes

- Updated dependencies [c33d2b0]
- Updated dependencies [688a231]
- Updated dependencies [7d6652a]
- Updated dependencies [d3e482c]
- Updated dependencies [c87d2b2]
- Updated dependencies [1603015]
- Updated dependencies [950261d]
  - @aparte/core@0.8.0

## 0.0.4

### Patch Changes

- Updated dependencies [4a180af]
  - @aparte/core@0.7.1

## 0.0.3

### Patch Changes

- Updated dependencies [acb1e37]
  - @aparte/core@0.7.0

## 0.0.2

### Patch Changes

- Updated dependencies [2075f9b]
- Updated dependencies [0c4c0e3]
- Updated dependencies [6e0211c]
  - @aparte/core@0.6.1

## 0.0.1

### Patch Changes

- @aparte/core@0.6.0

## 0.0.1-alpha.3

### Patch Changes

- Updated dependencies [cd7adfc]
- Updated dependencies [3edb766]
- Updated dependencies [3b026bb]
  - @aparte/core@0.5.0-alpha.0

## 0.0.1-alpha.2

### Patch Changes

- Updated dependencies [358bc53]
- Updated dependencies [801622a]
- Updated dependencies [0d4945f]
- Updated dependencies [de57a6a]
- Updated dependencies [50d90a8]
- Updated dependencies [cda5f54]
- Updated dependencies [af5ed3d]
- Updated dependencies [e9909c6]
- Updated dependencies [2336bc5]
- Updated dependencies [79b2795]
- Updated dependencies [9f839e4]
- Updated dependencies [80995ea]
- Updated dependencies [118d4fb]
  - @aparte/core@0.4.0-alpha.0

## 0.0.1-alpha.1

### Patch Changes

- Updated dependencies [d4c448b]
- Updated dependencies [0192d63]
- Updated dependencies [7227dee]
- Updated dependencies [622dc78]
- Updated dependencies [7227dee]
  - @aparte/core@0.3.0-alpha.0

## 0.0.1-alpha.0

### Patch Changes

- Updated dependencies [6ab5682]
- Updated dependencies [930a108]
- Updated dependencies [4065fd6]
- Updated dependencies [307039b]
- Updated dependencies [4aac26d]
- Updated dependencies [a2ed74b]
- Updated dependencies [a6ed936]
- Updated dependencies [333d301]
- Updated dependencies [14f1f1d]
- Updated dependencies [18d2065]
- Updated dependencies [6d6123e]
- Updated dependencies [97bd6c5]
- Updated dependencies [8417976]
- Updated dependencies [1f6c43e]
- Updated dependencies [7157ad5]
- Updated dependencies [2efef6f]
- Updated dependencies [0aefd9b]
- Updated dependencies [0aefd9b]
- Updated dependencies [9568c6b]
- Updated dependencies [7e5cfb7]
- Updated dependencies [75af64a]
- Updated dependencies [fa5a3f8]
- Updated dependencies [69525ad]
- Updated dependencies [8a3890b]
- Updated dependencies [d31f681]
- Updated dependencies [e69435f]
- Updated dependencies [bfa9901]
- Updated dependencies [49f4d70]
- Updated dependencies [fcff831]
- Updated dependencies [455fc81]
- Updated dependencies [554e4e9]
- Updated dependencies [6a50004]
- Updated dependencies [f8a6dd7]
- Updated dependencies [9ce7978]
- Updated dependencies [e96920a]
- Updated dependencies [d60e2c8]
- Updated dependencies [e8d9b32]
  - @aparte/core@0.2.0-alpha.0
