# aparté — release notes

Every `@aparte/*` package is released together at one version. Per-package detail
lives in each package's own `CHANGELOG.md`; this file is the aggregate, generated
by `scripts/gen-root-changelog.mjs` (run as part of `pnpm version-packages`).

## 0.13.1

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Patch Changes

- [73cbbdb](https://github.com/apartejs/aparte/commit/73cbbdb): Fixed: the delete button's cross was invisible while you hovered it, in both themes.

  `--aparte-conv-delete-bg-hover: var(--aparte-error)` has been declared all along and never
  applied: `.aparte-btn:hover:not(:disabled)` weighs 0,3,0 and `.aparte-conv-item__delete:hover`
  only 0,2,0, so the recipe won the background. The recipe's hover rule sets no colour,
  though, so the component's `color` DID apply — the ink meant for a solid red fill, painted
  on a neutral surface. Measured in a browser: 1.17:1 on the light theme, 1.20:1 on the dark.

  Feeding the recipe its own token instead of out-specifying it is the rule the neighbouring
  sheets already follow. The red applies now, and the pair measures 3.70:1 and 4.84:1 —
  clear of the 3:1 a graphical object needs. `.aparte-conv-item__archive` had the same
  silent defect: its declared surface never applied either.
  <sub>`@aparte/core`</sub>

- [2391d6d](https://github.com/apartejs/aparte/commit/2391d6d): The elicitation panel gives the focus back when it closes.

  It took focus on open and never returned it, so answering a question or approving a tool
  call dropped a keyboard user at the top of the document — they had to tab through the
  whole page to reach the composer again. WCAG 2.2 SC 2.4.3, level A, on the
  human-in-the-loop flow the library puts forward, and what the ARIA Authoring Practices
  Guide requires of every dialogue-shaped pattern.

  No restoration existed anywhere in core: `previousActive`, `restoreFocus`, `returnFocus`
  and `document.activeElement` together returned one hit across `packages/core/src`, in
  `aparte-select.ts`, for something else. The element that had the focus is now recorded
  once — before either branch opens a panel — and refocused from the single `close()` that
  ends both.

  It does not pull the focus back if the reader has moved on. A request can settle late (an
  abort, a model answering while they clicked elsewhere), and yanking them back would be the
  same theft in the other direction; the check reads `document.activeElement` before
  `hidePanel` removes it, because afterwards there is no way to tell.
  <sub>`@aparte/core`</sub>

- [3c99726](https://github.com/apartejs/aparte/commit/3c99726): Auto-follow no longer switches itself off because the content grew.

  `_handleScroll` assigned `_isAutoScrollEnabled = _isAtBottom()` on every scroll event, and
  `_isAtBottom()` answers "no" for two unrelated reasons: the reader moved up, or the content
  grew under them. The second disarmed the follow exactly when it was needed — a rebuild
  settles its height in stages, one stage fires a scroll event while the distance is briefly
  large, and the follow meant to keep the reader at the bottom had already switched off.

  They are told apart by POSITION now, which is what the note in that handler asked for and
  what an event counter could not do: growth does not move `scrollTop`, a reader going up
  does. A decrease disarms, the bottom re-arms, everything else leaves the flag alone.

  Five tests, with the geometry stubbed rather than laid out, because the case that matters
  is a swap between branches of different heights — including the shorter one, where the
  engine clamps `scrollTop` and the decrease is not a gesture at all.
  <sub>`@aparte/core`</sub>

- [655cdb1](https://github.com/apartejs/aparte/commit/655cdb1): A resize now re-derives the scroll-to-bottom button, so it stops getting stuck visible
  after a branch swap.

  "Is anything below the fold" is a pure function of the geometry the viewport's
  `ResizeObserver` exists to watch, and only the MUTATION path re-derived it — the resize
  path recalculated the spacer and left the button showing whatever the last mutation
  happened to measure. A branch swap rebuilds the transcript and React's height flickers
  through it (1730 → 1934 → 1730, measured); the settle back down is a resize, not a
  mutation, so a button evaluated at 1934 stayed wrong, and a swap fires no scroll event to
  correct it.

  Stated plainly: this closes a gap that is visible by reading, and it is covered by a test
  that goes red without it. It is **not** proven to be the cause of the intermittent
  `bubble-actions` failure on react-webkit — that one has not been reproduced locally (8/8
  green), and the CI evidence (the button held visible across 43 polls, five seconds after a
  swap) is consistent with this mechanism without establishing it.
  <sub>`@aparte/core`</sub>

- [73cbbdb](https://github.com/apartejs/aparte/commit/73cbbdb): Fixed: six elements overflowed their container by their own padding on a page with no
  `box-sizing` reset.

  `width: 100%` next to a `padding` is content-box arithmetic unless something says
  otherwise, and core is light DOM — a host that never wrote `* { box-sizing: border-box }`
  is not a broken host. Measured in a frame without a reset: a conversation row came out its
  parent's width plus both paddings and clipped its last button by the right one, which is
  how it was reported.

  `.aparte-menu__item`, `.aparte-message`, `.aparte-editor`, `.aparte-tag`,
  `.aparte-select-search` and `.aparte-accordion__header` now say `box-sizing: border-box`
  themselves — per element, never a `*` selector, the same way the eight that already had it
  are written.
  <sub>`@aparte/core`</sub>

- [f8d4fae](https://github.com/apartejs/aparte/commit/f8d4fae): A custom tool renderer keeps its styles when a stored conversation is re-rendered.

  The injection lived inline in two live paths — `AparteClient`'s `tool-start` handler and
  the stream adapter's — and nowhere on the path that draws history. So a renderer
  registered with `registerToolRenderer` came back styled while its tool ran and **bare
  after a reload**: the markup returned, because `toolCallRenderer` looks the renderer up
  and delegates to it, but nothing replays `tool-start` for a persisted message, so the CSS
  never arrived. Reported by a consumer who was re-injecting the stylesheet themselves at
  startup — the shape of a defect in this library, not a concern of theirs.

  One owner now, called from the render path as well as the two live ones, so "the renderer
  drew" and "its rules are on the page" cannot come apart again. Keyed by tool name, so it
  is still injected once however many times the segment is drawn.
  <sub>`@aparte/core`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.13.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [e50ca32](https://github.com/apartejs/aparte/commit/e50ca32): A panel says whether the composer's button has an act, and a single choice settles on the click.

  `showPanel({ mode })` takes a third value, `'none'`: this panel has nothing for the send
  button, so it is not drawn. Flip to `'submit'` with `setPanelSubmitEnabled` the moment the
  panel grows an act. The type is exported as `AparteComposerPanelMode`.

  **Why it was missing.** The composer's panel mode was ONE fixed policy — hide the text
  input and the attachment picker, keep the strip and the toolbar, and always keep the send
  button. A panel could supply DOM, two callbacks and an enabled flag; it could not say "my
  options settle themselves". So the approval panel, whose options have settled on the first
  click since they became buttons, sat next to a permanently disabled button offering an act
  that did not exist. Ratified decision #8, one control further along.

  **What changes for a user.** A question asked on its own — one choice, or one yes/no — is
  now a column of buttons, and the click is the answer. One gesture where there were two,
  and no submit beside options that already are the answer.

  This is the accessible reading, not a trade against it. WCAG SC 3.2.2 ("On Input") and its
  F36 failure forbid submitting automatically when an _input_ is given a value: a radio that
  fires on change is exactly that, which is why these options are buttons — an explicit
  activation is what F36 says to rely on instead. Auto-advancing radios is separately a
  documented barrier, because it removes the chance to review a selection; a command button
  has nothing to review. The group's role moves from `radiogroup` to `group` to match, and
  keeps its accessible name.

  **What deliberately does not change**, each for a measured reason:

  - **A form of several questions.** Settling on its last question would be F36 word for
    word, and auto-advancing between them is the barrier above. Chips, advance and submit
    are untouched.
  - **A multi-select and a free-text question.** Both accumulate, so both need a commit.
  - **A choice carrying a `default`.** A button cannot be pre-selected, and a requester that
    supplied one asked for a pre-filled answer it can review before sending — MCP's "clients
    SHOULD pre-populate". That shape keeps its radios and its submit.
  - **"Other…"**, which is not an answer but a request to write one: it opens the field and
    hands the button back its meaning.

  A consumer who wants pick-then-submit for a single choice registers an
  `AparteElicitationFieldRenderer` for `enum`; a field renderer never settles.

  `buildElicitationPanel` gains `onSettle`, the contract `buildApprovalPanel` already had.
  <sub>`@aparte/core`</sub>

- [ca49417](https://github.com/apartejs/aparte/commit/ca49417): The five accents-as-text derive from their own fill; ten hexes become one number per theme.

  `--aparte-primary-ink` and its four siblings were hand-picked hexes — five in the light
  block, five in the dark — each measured against THIS repo's `--aparte-bg`. They paint every
  ghost, outline and soft button's label, links, the selected tab, the tool-call status and
  the form error marker, so a consumer's palette got accent colours computed for someone
  else's page. Same defect as the solid ink, one layer over.

  Each is now the accent with its own hue and chroma kept, and its lightness forced to
  `--aparte-ink-l` — the one value that has to flip with the theme (`0.40` light, `0.85`
  dark). The five derivations live on the anchored layer, so an `<aparte-chat>` that sets its
  own `--aparte-primary` gets a matching ink rather than the root's.

  **Why forced lightness and not a mix.** Pulling the accent toward `--aparte-text` reads
  well and was measured first: it holds on our palette and fails at 3.41 on a brand primary
  that is already near the background, because such an accent has to move PAST the text
  colour, not toward it. Setting the lightness outright has no such blind spot.

  Measured across 80 combinations — 5 intents x 4 palettes (ours light, ours dark, two
  invented) x 4 grounds (bg, surface-1/2/3) — the worst case is 4.80. On our own palette the
  inks land between 7.12 and 12.24, against 4.60–4.63 for the hexes they replace, and each
  accent keeps its character on screen: brass reads brass, danger reads red.
  <sub>`@aparte/core`</sub>

- [82b842e](https://github.com/apartejs/aparte/commit/82b842e): Ready-made button classes. Put `aparte-btn` on a `<button>` and it looks like every
  other control in the library.

  ```html
  <button class="aparte-btn aparte-btn--primary my-send">Send</button>
  <button class="aparte-btn aparte-btn--icon" aria-label="Copy">…</button>
  ```

  Your own class stays on the element — for events, and so a consumer can target that
  one button. It just stops carrying the look.

  **Nothing existing changed.** This is a new sheet and twelve new tokens; no rule was
  touched, so no pixel moved. Adopting it in the library's own 27 controls is the next
  step, not this one.

  ### Measured, not invented

  The 33 control rules already in this library were read, and the base is what they
  agree on: flex-centred, transparent, borderless, `cursor: pointer`, `flex-shrink: 0`.
  What they did **not** agree on is why the file exists — `transition` appeared in 13 of
  them with 12 different values, `border-radius` in 12 with 11. Nobody decided; everyone
  filled in.

  The variants come from the same reading, and the set is short on purpose:

  | class                 | what it is                            | controls already like this |
  | --------------------- | ------------------------------------- | -------------------------- |
  | `aparte-btn`          | ghost — transparent, muted            | 33                         |
  | `aparte-btn--surface` | raised: has its own ground and border | 3                          |
  | `aparte-btn--primary` | filled with the accent                | 2                          |
  | `aparte-btn--success` | tinted, not filled                    | 2                          |
  | `aparte-btn--danger`  | tinted, not filled                    | 1                          |

  There is no `--secondary`: nothing in this library is secondary, and a variant nobody
  wears is a contract maintained for nobody. `--success` and `--danger` tint rather than
  fill because that is what the existing controls do.

  Shape and size: `--icon` (square, sized by the modifier) and `--sm` / `--lg` around a
  default `--md` — 20px, 28px, 36px, the three sizes this library already uses.

  `:disabled` lives here once. It was six rules saying the same two declarations.

  ### Verified in a browser

  Every variant rendered and its computed style read: the accent fill resolves to the
  brass `rgb(176,125,51)`, the icon sizes to exactly 28/20/36px, disabled to opacity 0.5
  and `not-allowed`. And a single `<aparte-chat>` at `--aparte-font-scale: 1.25` gives a
  29px button against the default's 22px — the recipe follows the masters, per instance.
  <sub>`@aparte/core`</sub>

- [7713818](https://github.com/apartejs/aparte/commit/7713818): The masters now reach the component tier, which is what makes them masters.

  `--aparte-space-unit` moved the scale and stopped there: 28 component tokens were
  literals whose values already WERE steps — `--aparte-message-gap` was `12px`, which is
  `space-6` — so a chat at `--aparte-space-unit: 3px` grew its gutters and kept its
  message padding at 16px. It scaled crooked. They derive now.

  Proven in a browser, side by side: at `--aparte-space-unit: 3px`,
  `--aparte-radius-unit: 4px`, `--aparte-font-scale: 1.25` on ONE `<aparte-chat>`, its
  message padding goes 16/12px → 24/18px, its viewport padding 16 → 24px, its option
  radius 8 → 16px and its content text 15 → 18.75px, while the sibling chat at the
  defaults does not move.

  And measured the other way: of 317 pre-existing tokens resolved on a real property in
  both themes, **not one changes value**. This is a pure refactor.

  ### The line, because there is one

  The spacing scale governs gutters, padding and margin. The radius scale governs
  corners. The type scale governs text. **None of them governs a stroke width or a
  control's size.** `--aparte-thinking-rail-width` stays `2px` because loosening spacing
  must not thicken a rule, and `--aparte-avatar-size` stays `32px` because tightening it
  must not shrink an avatar. Both verified to stay put under a moved master.

  Eight text sizes were px and are rem now (`--aparte-content-font-size`,
  `--aparte-input-font-size`, `--aparte-avatar-font-size`, `--aparte-name-font-size`,
  `--aparte-timestamp-font-size`, `--aparte-branch-picker-label-size`,
  `--aparte-input-editor-font-size`, `--aparte-status-font-size`) — identical at a 16px
  root, and following the reader's browser setting elsewhere, like the rest of the
  typography.
  <sub>`@aparte/core`</sub>

- [466b849](https://github.com/apartejs/aparte/commit/466b849): The rest of the stylesheet joins the token system — and the artifact panel starts
  working in dark mode.

  The previous pass tokenised spacing, radius, hairlines and motion. It left everything
  else, which turned out to be **101 declarations writing a raw value on a property that
  already had a family of tokens**. 75 of them are gone.

  **Weights and type.** 11 raw `font-weight`s (500/600/700) where
  `--aparte-font-weight-*` existed — the file's own comment claimed "no raw weights".
  22 `font-size`s, all in the artifact and tool components, which had never joined the
  type scale at all: nine values between `0.7rem` and `0.92rem`, none of them a step.
  Each moves to its nearest step, and the largest move is **0.48px**. Four
  `line-height`s land on a new `--aparte-line-height-snug` (one of them was `1.35`, so
  it moves 0.8px).

  **A second owner for "the code font".** Two rules carried their own monospace stack
  (`'JetBrains Mono', 'Fira Code', …`) instead of `--aparte-code-font-family`, so the
  artifact's code pane rendered in a different font from every other code block.

  **The error panel was unreadable in dark mode.** `.aparte-art-file__error*` hardcoded
  `#b91c1c` and `#7f1d1d` — dark reds — on a panel that goes dark with the theme, while
  `--aparte-error-title` / `-text` / `-bg` / `-border` existed and flip correctly. They
  are used now.

  **Paper is named, not hardcoded.** A file preview is a document shown inside the chat,
  so it stays light whatever the theme is — an intent that was already written in a
  comment beside a literal `#fff`. `--aparte-art-paper-bg|text|row-alt|head-bg|head-text|border`
  express it and are deliberately absent from the dark block. The file-type tiles keep
  their brand gradients, now as `--aparte-art-file-icon-bg[-pdf|-docx]`.

  **The prose family was half-tokenised**: sizes and weights named, margins written out.
  Eight tokens complete it (`--aparte-prose-h1..h4-margin`, `-blockquote-margin`,
  `-blockquote-indent`, `-hr-margin`, `-code-padding`), in `em` on purpose — the one
  place where relative beats the px scale, because a heading's margin should follow its
  own size.

  **`select.css` was the only sheet spacing in `rem`** (`0.5rem`, `0.75rem`, `0.25rem`)
  while the rest of core used the px scale. Nine declarations now use the scale;
  identical at a 16px root.

  Two things this pass caught in its own work. Routing a fixed-background tile to
  `--aparte-text-inverse` would have put near-black lettering on a dark green tile in
  dark mode, because "inverse" follows the theme and that tile does not — it has
  `--aparte-art-file-icon-color` instead. And `--aparte-select-radius` ended up with two
  different fallbacks, one per reference, which is a third way to own a value twice; the
  guard now refuses that too, alongside the fallback-on-a-declared-token and
  declared-twice rules. All three are proven by sabotage.

  ### Still raw, on purpose

  `opacity`. Ten of its uses are `0` (show/hide), which is not a token. The rest are
  seven **disabled** states carrying **five different values** — 0.3, 0.45, 0.5, 0.5,
  0.55, 0.6, 0.6. That is real drift, but collapsing it is visible (a disabled branch
  arrow at 0.3 nearly doubles in weight at 0.5), so it stays a design decision rather
  than a sweep. `margin: 0 auto`, a `-1px` caret nudge and one `font-size: 1em` stay
  literal: they are geometry and relative sizing, not design values.
  <sub>`@aparte/core`</sub>

- [96c23c3](https://github.com/apartejs/aparte/commit/96c23c3): The stylesheet becomes a token system: one owner per value, and three masters that
  actually move the whole scale.

  **The scale now derives.** `--aparte-space-unit`, `--aparte-radius-unit` and
  `--aparte-font-scale` are new, and every step is computed from one of them
  (`--aparte-space-4` is `calc(var(--aparte-space-unit) * 4)`). Before, each step was a
  literal, so there was no single value to move. Measured after the change: of 265
  pre-existing tokens, resolved on a real property in a browser, in both themes,
  exactly one resolves differently — the deliberate rename below. The rest land on the
  same pixel.

  **Type is in `rem`.** The font-size scale was px, so it ignored the reader's browser
  font size — the one accessibility setting a chat has to honour. At the default 16px
  root nothing changes; at any other setting the chat now scales with the page.
  `--aparte-font-scale` multiplies the whole ramp for an app that wants it smaller or
  larger without restating six values.

  **One owner per value.** 471 `var(--x, fallback)` fallbacks were removed, of 521. A fallback
  only applies when the token is undeclared, and `src/index.ts` imports every stylesheet
  core ships — so those fallbacks never applied. They only drifted: in the theme sheet alone, **155 of them
  contradicted the declared value**, `--aparte-border` carrying eleven different
  fallbacks and `--aparte-primary` falling back to an indigo the palette had left. The
  worst were nested inside `select.css`, where dark literals (`#1e293b`, `#334155`) sat
  on the light path. The 18 tokens core never declares keep their fallback: there the
  fallback IS the owner, which is the "unset by default" knob.

  **Motion is tokenised.** `--aparte-duration-fast|base|slow|slower|spin|pulse`,
  `--aparte-ease` and `--aparte-slide-distance`. 48 hardcoded durations across 27 rules
  read them now. `prefers-reduced-motion` overrides the tokens rather than sweeping
  selectors, which closes a real hole: two hand-written patches existed because the old
  sweep matched only DESCENDANTS of core's elements, never the elements themselves.

  **Windows high contrast.** In `forced-colors` mode the UA drops `box-shadow`, so the
  two focus indicators built on `--aparte-focus-ring`, and the error ring on an avatar,
  did not change colour — they vanished. They are restated as outlines.

  New tokens: `--aparte-z-raised`, `--aparte-z-dropdown`, `--aparte-z-floating` (a host
  can now lift its own modal over the scroll button), `--aparte-focus-outline-offset`,
  `--aparte-avatar-error-ring`, `--aparte-select-shadow`, and twelve component sizes that
  were magic numbers in a rule.

  ### Breaking for themes

  | before                                                             | after                              |
  | ------------------------------------------------------------------ | ---------------------------------- |
  | `--aparte-select-min-width` (120px, styled `.aparte-model-select`) | `--aparte-model-select-min-width`  |
  | `--aparte-select-min-width`                                        | now means `<aparte-select>`, 200px |

  The name pointed at the wrong widget, next to a `<aparte-select>` it did not control.

  ### Visible changes, on purpose
  - **The `<aparte-select>` focus ring follows the theme.** It was a second, diverged
    implementation hardcoded to Tailwind blue `rgba(59,130,246,.2)`; it now uses
    `--aparte-focus-ring` like every other focus ring, so it is brass in the default
    theme instead of blue.
  - **The select dropdown has a shadow in dark mode.** Its shadow lived as a fallback,
    so it had no dark value at all, and `rgba(0,0,0,.1)` over a dark surface is no
    shadow.
  - **Six off-scale values moved by 1px** to land on the spacing scale (a 7px gap to
    8px, a 3px padding to 4px, and so on).
  - **The select spinner turns at 0.7s instead of 0.6s**, joining the one rotation speed
    the sheet already named.
  <sub>`@aparte/core`</sub>

- [3889d8f](https://github.com/apartejs/aparte/commit/3889d8f): One value for "this control is disabled": `--aparte-disabled-opacity`, default `0.5`.

  Seven disabled states carried five different opacities — `0.3`, `0.45`, `0.5`, `0.5`,
  `0.55`, `0.6`, `0.6` — and not one of them had a comment saying why, so there was
  nothing to preserve in keeping them apart. They all read the token now.

  Deliberately ONE knob rather than Material 3's `content` / `container` pair: that
  split exists to tint a container's background separately from its text, and every
  case here is a whole control fading. And not Bootstrap's per-component variable
  (`--bs-btn-disabled-opacity`) either — a variable per family is the drift this
  removes, with names on it.

  ### Visible

  |                                           | before | after |
  | ----------------------------------------- | ------ | ----- |
  | `.aparte-branch-prev\|next:disabled`      | 0.3    | 0.5   |
  | `.aparte-editor[contenteditable="false"]` | 0.6    | 0.5   |
  | `.aparte-ci-editor[aria-disabled="true"]` | 0.6    | 0.5   |
  | `aparte-composer[data-model-gated]`       | 0.55   | 0.5   |
  | `.aparte-send-button:disabled`            | 0.45   | 0.5   |

  The branch arrows are the one real change: at `0.3` they were the faintest disabled
  thing in the library, and they now match everything else.

  Untouched, because they are not the same thing: 21 `opacity: 0|1` (that is show/hide,
  not a design value) and 8 decorative fades on states that are not disabled — a muted
  label, a hovered icon, an archived conversation.

  ### Still open, and separate

  `aparte-composer[data-model-gated]` puts the opacity on a CONTAINER, and core renders
  into the light DOM — so it also fades whatever the consumer slotted into
  `above-composer` and the toolbar. That is precisely why Carbon, Ant Design and Fluent
  use dedicated disabled _colours_ rather than opacity. Whether a gated composer should
  fade at all, or change colour, is a design question this token does not settle.
  <sub>`@aparte/core`</sub>

- [13ec8ca](https://github.com/apartejs/aparte/commit/13ec8ca): Every element now carries its own documentation, and the docs site is generated from it.

  `package.json` points `customElements` at `dist/custom-elements.json` and `files` ships `dist`,
  so this file is what feeds a consumer's editor autocomplete — not only apartejs.dev. It was
  thin, wrong in five places, and in one package it did not exist at all.

  ## The manifest, measured across core's 18 elements

  |                                        | before  | after       |
  | -------------------------------------- | ------- | ----------- |
  | descriptions under 200 characters      | 10 / 18 | **0 / 18**  |
  | elements declaring their CSS variables | 0 / 18  | **17 / 18** |
  | declared slots                         | 1       | **0**       |
  | elements carrying a worked example     | 18 / 18 | 18 / 18     |

  **The CSS variables are the substantial half.** 263 exist and not one was attached to the
  element it styles, so they were reachable only through a single flat 263-row reference — present
  and unfindable, which is the failure this repo keeps rediscovering. **177 are now declared on
  their own element**, with the default the stylesheet actually sets. The eighteenth, the composer
  toolbar, correctly declares none: it is styled entirely by global spacing tokens and has no knob
  of its own.

  **The slot count going to zero is the fix, not a regression.** Core has no shadow DOM — no
  `attachShadow`, no `<slot>` element anywhere — so it has no slots. A `@slot` in a manifest
  declares a real slot NAME a consumer can write and tooling will offer; one had shipped for a
  `panel` region that is a plain child stamped `data-aparte-panel`, so an editor would have
  completed a name that does nothing. Ratified decision #4: a name a context contradicts is a name
  that will lie. What an element accepts as children, and where those children land, is now prose.

  ## Five published claims were false, and are corrected rather than softened
  - `<aparte-chat-viewport>`'s `framework-managed` said it "relocates none of its children". It
    re-appends core's own scroll-to-bottom button whenever that stops being last, and that path
    runs in framework-managed mode only. The guarantee is about the nodes the FRAMEWORK renders.
  - `<aparte-chat>` described its composition test as looking for a viewport CHILD. It is a
    descendant query, so a viewport nested inside a wrapper of your own counts — and the
    difference decides whether your markup survives or is overwritten by the default composition.
    Only the centering CSS is direct-child, and only that sentence now says so.
  - `<aparte-chat>` said "a framework wrapper sets `framework-managed`". Only Angular's does: its
    component selector IS `aparte-chat`, while React, Vue and Svelte render a `[data-aparte-chat]`
    div and never create the element.
  - `--aparte-viewport-padding` promised that a narrow container reduces it. That rule targets a
    wrapper the framework-managed path never builds — and it cannot be repaired by adding the
    host, because `container-type` is declared on the viewport itself and a container query never
    matches its own container.
  - `<aparte-composer>`'s `--aparte-message-max-width` said overriding it "moves both". Custom
    properties inherit downward and `.aparte-message` is a sibling subtree, so set on the composer
    it moves only the composer.

  Each was found by an adversarial pass that was told to refute, not to confirm.

  ## `@aparte/plugin-ask-user` ships a manifest for the first time

  It defines a custom element with `customElements.define` and shipped nothing machine-readable
  about it: no `customElements` field, no `analyze` step, no manifest — while its sibling
  `@aparte/plugin-model-selector` has had all three since it shipped. So no editor completed
  `<aparte-ask-user>`'s surface, and no page could be generated from it. It has one now.

  The analyzer plugin that lifts `@example` blocks into a manifest lived inline in core's config,
  so neither plugin element had an example in its own manifest. It is now shared by all three
  configs, and all three report every element carrying one.

  ## Why minor rather than patch

  Nothing's runtime behaviour changed in this entry, but the manifest is a PUBLISHED description
  of the API: a declared slot disappears, 177 CSS custom properties appear, and a package gains a
  `customElements` pointer where it had none. Tooling reads all of that. Calling metadata that
  consumers' editors consume a patch would understate it.
  <sub>`@aparte/core`, `@aparte/plugin-ask-user`</sub>

- [14a55b0](https://github.com/apartejs/aparte/commit/14a55b0): New entry point: `@aparte/core/icons`, with 41 glyphs core itself never draws.

  ```ts
  import { searchIcon, trashIcon } from "@aparte/core/icons";
  button.innerHTML = searchIcon;
  ```

  They cover the vocabulary around a chat rather than inside one — search, filter, folder,
  code, trash, settings, user, bot, database, globe, key, mic, eye, clock, history, star,
  share, sun/moon, and the arrows and chevrons.

  **A separate entry point, not an addition to the built-in set**, and the reason is
  mechanical: `getIcon(name)` reads `APARTE_DEFAULT_ICON_FALLBACKS` by a computed key, so
  a bundler cannot tell which entries a build reaches and keeps the object whole. Anything
  added there ships to everyone, used or not. These are individual exports instead —
  import three, pay for three, and nothing at all if you never open the module. Measured
  on the built output: `@aparte/core` grows 554 bytes (a chunk boundary) and contains none
  of them; `@aparte/core/icons` is 21.6 kB and shares the built-in glyph chunk, so a
  consumer of both never pays for a drawing twice.

  Every glyph carries `class="aparte-icon"`, so `--aparte-icon-size` sizes it wherever it
  lands. Shapes and names follow Lucide, so swapping in the real thing changes the import
  and nothing else; nothing is imported from it.

  The full set is on the generated **Icons** reference page, each glyph shown at its
  export name.
  <sub>`@aparte/core`</sub>

- [3e2afee](https://github.com/apartejs/aparte/commit/3e2afee): Every glyph the library draws now lives in one place, `src/icons/glyphs.ts`, and each is
  an individual export.

  Scattering them had not merely spread the source around — it had let them DRIFT. There
  were three different ✕ (a filled one on a 12 grid, a stroked one at 2.5, and `close`),
  two different chevrons, and `paperclip` and `scrollDown` each existed twice, byte for
  byte, inside a component that could have asked for them. Three stroke widths, three
  grids.

  Four names are new, so a consumer's icon pack can now replace them: `info`, `archive`,
  `unarchive`, `download`. The bubble's info glyph in particular was inline precisely so
  that it needed no key, which meant nobody could change it.

  A glyph no longer carries its own size — that is what kept the same drawing from being
  shared. `--aparte-icon-size` is the one knob and it inherits, so a container declares it
  and every glyph below follows; `.aparte-btn > svg` and the other rules that already
  expressed size in CSS still win and are untouched. Measured in a browser: no icon
  changes size.

  Fixed: core's `loading` icon did not spin. It carried `aparte-icon-spin` and nothing
  declared it.

  `@aparte/core`'s JS bundle drops 2.1 kB.
  <sub>`@aparte/core`</sub>

- [53d99d8](https://github.com/apartejs/aparte/commit/53d99d8): `<aparte-icon>` — the icon set, reachable from markup.

  Core ships 25 glyphs and sells `setIconProvider` as the lever that swaps them, and the only
  door in was `getIcon(name)`: JavaScript. So a consumer writing plain HTML could not place
  one, and the provider they registered could not reach a single icon in their own templates.
  `<aparte-composer-action>`'s own documentation tells you to put an `<svg>` inside it, which
  is that gap written down as an instruction.

  It is why every example on the CSS-classes reference carried 265 characters of path data to
  demonstrate a 60-character class — there was no shorter way to say "an icon goes here" that
  actually drew one. Those examples now read `<aparte-icon name="copy">`, and SVG is **0%** of
  the markup that page publishes, against 22% before.

  ```html
  <button class="aparte-btn aparte-btn--icon" aria-label="Copy">
    <aparte-icon name="copy"></aparte-icon>
  </button>
  ```

  It routes through `getIcon`, so it is not a second icon mechanism — it is a markup entrance
  to the one that exists. Register a provider and every `<aparte-icon>` follows, including
  ones mounted before the provider was set.

  **Why an element and not CSS classes.** A `mask-image` class would need no JavaScript, and
  that is genuinely attractive — but it cannot consult the icon provider, so a consumer who
  swapped the set would get theirs where core draws and ours where they wrote a class: the
  exact inconsistency this closes, moved elsewhere. A masked icon is also painted by a
  `background`, which forced-colors mode drops, while an inline SVG on `currentColor`
  survives — the same argument `menu.css` already makes for its checkmark. Weight was not the
  deciding factor: 25 encoded glyphs are ~7 kB against the stylesheet's 263 kB.

  **The cost, stated:** the 25 glyph names become public API. `expand`, `copy`, `nextBranch`
  were internal identifiers; renaming one now breaks a consumer's markup.

  An unknown name draws nothing rather than printing `undefined`, and the glyph is
  `aria-hidden` — when the icon is a button's only content, name the button.
  <sub>`@aparte/core`</sub>

- [a2274be](https://github.com/apartejs/aparte/commit/a2274be): Every intent has a named ink, and core works it out when you do not.

  **What was wrong.** `--aparte-on-intent: #14100a` was a hex chosen by measuring against
  THIS repo's own intent fills, and every solid button, badge and checkbox took its label
  colour from it. That made core's rendering depend on core's palette, in a library whose
  premise is that consumers bring their own. The theming guide teaches an eight-line
  rebrand and `<aparte-chat style="--aparte-primary: …">` and named that token in neither,
  so a dark brand colour got near-black on it and no signal — **1.11:1** measured on a navy
  `#1a1a2e`, **1.83:1** on slate `#334155`.

  It was broken on the stock palette too. Escaping the constant needed a per-intent
  exception and `--neutral` had one, a hardcoded white copied into three sheets. It was
  pinned while the fill flips with the theme (`#6d6479` → `#a89bb6`), so in dark mode the
  neutral solid button's label, the neutral badge's text and the neutral checkbox's
  checkmark all shipped at **2.62:1**. Nothing measured it.

  **The contract is now a pair per intent**, and a theme declares whichever half it has an
  opinion about:

  ```
  --aparte-primary / --aparte-on-primary        --aparte-info    / --aparte-on-info
  --aparte-secondary / --aparte-on-secondary    --aparte-success / --aparte-on-success
  --aparte-neutral / --aparte-on-neutral        --aparte-warning / --aparte-on-warning
  --aparte-error / --aparte-on-error
  ```

  None of the seven `--aparte-on-*` ships declared. An undeclared partner means "work it
  out", and each recipe derives the ink from its own fill — keep the hue, drop the chroma
  to a trace, pick lightness either side of `--aparte-ink-flip`. Declare one and it wins
  for every control using that intent. The shape shadcn uses, with Bootstrap's computed
  default behind it; this repo had borrowed Material's `on-*` naming and backed it with a
  constant.

  Measured in a browser on the built stylesheet: **42 of 42** control/intent/theme
  combinations clear AA, where `neutral` in dark read 2.62. The derivation also matches or
  beats the old hand-picked value on every fill this palette declares.

  - **Removed:** `--aparte-on-primary`'s hardcoded `#ffffff`. The name stays as the pair
    partner — undeclared, so it derives. Its only readers were the three `--neutral` rules,
    and it was separately documented on `<aparte-composer-send>` as the send icon's colour,
    which that button never read.
  - **Added:** `--aparte-ink-flip` (0.57) and `--aparte-ink-dark` (0.176) — how the computed
    default behaves, one knob each for every solid control. `--aparte-derived-ink` exposes
    the computed value itself.
  - **Kept:** `--aparte-on-intent`, now only the fallback for a browser without relative
    colour syntax (Firefox before 128), reached through `@supports` — a custom property does
    not fall back on an unparsable value the way a real property does.

  The theming guide now documents the pairs, which is the half that made the original defect
  invisible: the mechanism existed and nothing told a consumer it was theirs to set.
  <sub>`@aparte/core`</sub>

- [aaf8d5c](https://github.com/apartejs/aparte/commit/aaf8d5c): A neutral UI layer: ready-made classes for every native HTML control, plus the display
  and surface primitives a UI library is expected to have.

  The layer is NEUTRAL on purpose — it is what a UI library offers, not a summary of what
  this repo uses. A variant nothing wears still ships, because the plugin that needs it is
  not written yet, and its absence is what makes an author invent a seventh shade of
  orange.

  ### The button, rebuilt on two axes

  An **intent** says which colour a button means; a **fill** says what to do with that
  colour. Seven intents (primary, secondary, neutral, info, success, warning, danger)
  times five fills (ghost, solid, outline, soft, surface) is thirty-five buttons out of
  twelve classes, and every combination works because neither axis knows about the other.

  ```html
  <button class="aparte-btn aparte-btn--primary aparte-btn--solid">Send</button>
  <button class="aparte-btn aparte-btn--danger aparte-btn--outline">
    Delete
  </button>
  ```

  Plus `--icon`, `--pill`, `--circle`, `--block`, three sizes, six states (hover, active,
  focus-visible, disabled, toggled via `aria-expanded`/`aria-pressed`, busy via
  `aria-busy`), and `.aparte-btn-group` with logical joined corners.

  Text on a solid fill is INK, not white — measured on every intent this palette declares:
  ink wins on six of seven (warning 7.49 against 2.15, success 6.34 against 2.54), white
  only on neutral. Three intents reach neither 4.5 with either colour (primary 4.46, info
  4.37, danger 4.27); that is the palette's mid-luminance, and it is worth knowing before
  you put a normal-size label on a solid button.

  ### Three new sheets

  `field.css` — the shared text-entry recipe on `<input>`, `<textarea>` and `<select>`,
  with sizes, a prefix/suffix group, and invalid via `aria-invalid` rather than `:invalid`
  alone (which fires before the user has typed). Checkbox, radio, switch and range, each
  carrying the intent axis. Label, hint, error, required marker, fieldset. And the five
  native controls that were missing: colour, the date and time family, `<meter>` (its
  three bands take the three status colours), `<output>`, and a standalone `.aparte-link`.

  `display.css` — badge (intents × solid/soft/outline, plus `--dot`), removable tag,
  avatar and avatar group, spinner, progress, skeleton, divider, alert, card, `<kbd>`.

  `surface.css` — tabs, accordion, menu, popover, tooltip. No dialog, drawer or toast:
  those need a portal and a stack manager, and belong to the consuming application.

  ### Two things the guard learned

  **A component may parameterise itself.** `.aparte-btn` declaring `--aparte-btn-intent`
  is not the failure the guard watches for — that failure is a theme token derived once on
  `:root`, which then cannot follow a palette a subtree overrides. The exemption is narrow:
  the name must be prefixed by the component the selector names.

  **A component-scoped declaration is not a default.** `--aparte-spinner-size` was declared
  on `.aparte-spinner` alone, and the single-owner rule then flagged the fallback that
  `<aparte-progress-spinner>` — which does not wear that class — was relying on. Removing
  it collapsed the element to `auto`. The rule now only forbids a fallback on a token
  declared where every element can resolve it.

  ### Measured

  391 tokens declared and no dangling reference; the fifteen sheets balanced; 22 rendered
  families all styled; the tooltip and the layered shadows verified to flip with the dark
  theme. `dist/index.css` goes from 135 kB to 219 kB — the new layer is 84 kB, which is
  worth knowing for a consumer who only wants the chat.
  <sub>`@aparte/core`</sub>

- [9a1471e](https://github.com/apartejs/aparte/commit/9a1471e): The scroll-to-bottom button is `aparte-btn--lg aparte-btn--circle` and stops redrawing
  what that already means.

  Its 36px box is exactly `--aparte-btn-size-lg`, so naming the size gives it the box, the
  round corner and a 20px glyph for free — the arrow was 16px in a 36px circle, 44% of its
  box where the rest of the library reads at ~57%.

  **Removed:** `--aparte-scroll-btn-bg`, `--aparte-scroll-btn-hover-bg`,
  `--aparte-scroll-btn-color` and `--aparte-scroll-btn-border`. Each resolved to exactly
  what `aparte-btn--surface` already applies (`var(--aparte-surface-1)`,
  `var(--aparte-surface-2)`, `var(--aparte-text)`, `var(--aparte-border)`) — four names
  for one thing. Rendering is byte-identical in both themes; measured. To restyle the
  button, target `.aparte-scroll-btn` directly, which light DOM has always allowed.
  `--aparte-scroll-btn-size` and `--aparte-scroll-btn-shadow` stay: they are the two
  things the recipe has no word for.

  Also fixed: a consumer's custom bubble action button rendered without the button recipe,
  so it had no focus ring, no hover and no padding reset. Three dead CSS rules for
  `aparte-composer-dictate` — an element that has never existed — are gone. And
  `<aparte-progress-spinner>`'s `--aparte-spinner-size` was documented as 14px when it has
  always been 16.
  <sub>`@aparte/core`</sub>

- [a8804ee](https://github.com/apartejs/aparte/commit/a8804ee): Five segment types that were public in everything but name are now exported.

  `AparteSegment` is exported and its union names all eight members, yet two of them could
  not be written down: narrowing on `type: 'error'` gave a consumer the shape and no way to
  declare a variable of it. `AparteErrorSegment` and `ApartePipelineWaitingSegment` are
  exported now — the second was reachable from no barrel at all, not even the internal one.

  `AparteSegmentBase` is the worse omission, because it is not an omission from a list: it
  is the CONSTRAINT on the exported `AparteSegmentRenderer<T>`. Writing a renderer for a
  segment type of your own means declaring `MyType extends AparteSegmentBase`, and the
  package did not export the name.

  `AparteSegmentTiming` types `meta.aparte`, which the customization guide already
  described as "still typed" while it was unnameable; `AparteSegmentDefaults` types what
  `setSegmentDefaults()` takes, and both are exported too.

  All five are exported from the SSR barrel too — a type has no DOM, and TypeScript resolves
  `types` under the `node` condition, so exporting them from the browser barrel alone would
  have compiled for everyone except an SSR consumer.

  No shape changed. This is the barrels catching up with what the types already said.
  <sub>`@aparte/core`</sub>

- [45a1083](https://github.com/apartejs/aparte/commit/45a1083): Three pairs of tokens holding one value, and two rules written twice.

  **The elicitation panel and the conversation item were outside the systems.** Their
  sizes were literals off every step — `0.76`, `0.78`, `0.8`, `0.82rem` — and the same
  `7px 10px` padding was written under two names. Eleven tokens now derive: sizes land on
  the type scale, the padding on the spacing scale. Measured in a browser across both
  themes: six values move, the largest by **0.48px**. The point is not the pixels — it is
  that these two panels now follow `--aparte-font-scale` and `--aparte-space-unit`, which
  they did not.

  `--aparte-input-container-min-height` was `44px` beside `--aparte-touch-target-size:
44px`. The input's minimum height IS the touch target, so it reads it now.

  **Two artifact segments shared one card shell, written twice** — nine identical
  declarations on `.aparte-segment-artifact-card` and `.aparte-segment-artifact-file`.
  One rule, two selectors. Checked before merging: nothing between the two positions
  targets either, so the cascade is unchanged.

  **`aparte-model-selector` and `.aparte-model-selector`** declared the same three
  properties in two rules. The class is the hook for an app that lays out its own
  selector, and it had drifted in one respect already: `[hidden]` covered the element
  only, so a hidden wrapper carrying the class stayed laid out. Both are grouped, and
  `[hidden]` now covers both.

  ### Looked at and deliberately left

  `cursor: not-allowed; opacity: var(--aparte-disabled-opacity)` appears on six
  selectors across two files. The value that could drift is already a token; what
  repeats is `cursor: not-allowed`, which cannot. Grouping six selectors across two
  files would move rules through the cascade for no protection.

  Three token pairs that look like duplicates and are not, measured rather than assumed:
  `--aparte-neutral` and `--aparte-text-muted` are equal in light and **diverge in dark**
  (`#6d6479` vs `#a89bb6`), so merging them would break the dark theme;
  `--aparte-text-inverse` equals the lightest surface in light and the darkest ground in
  dark, which is one coherent idea — "the opposite pole" — not a copy; and
  `--aparte-surface-3` equals `--aparte-border` in dark, which paints nothing wrong
  because no element with a `surface-3` background carries a border.
  <sub>`@aparte/core`</sub>

- [73238ac](https://github.com/apartejs/aparte/commit/73238ac): The question-receipt's classes stop leaking onto your page.

  **BREAKING for themes of this plugin**: eight names change.

  The plugin styled and emitted seven UNPREFIXED classes. Core renders into the light DOM —
  no shadow root, no `::part()` — so an unprefixed rule in a package a consumer imports is a
  **global** rule on their page.

  `.segment` is the worst of them: it is Semantic UI's own base class, and CLAUDE.md already
  names it as a known collision. The same package's other renderer was writing
  `aparte-segment` correctly, so the two disagreed with each other.

  | before                    | after                                        |
  | ------------------------- | -------------------------------------------- |
  | `.segment`                | `.aparte-segment`                            |
  | `.seg-qreceipt`           | `.aparte-question-receipt`                   |
  | `.seg-qreceipt-group`     | `.aparte-question-receipt__group`            |
  | `.seg-qreceipt--declined` | `.aparte-question-receipt--declined`         |
  | `.qr-question`            | `.aparte-question-receipt__question`         |
  | `.qr-answer`              | `.aparte-question-receipt__answer`           |
  | `.qr-sep`                 | `.aparte-question-receipt__sep`              |
  | `.qr-declined`            | `.aparte-question-receipt__answer--declined` |
  | `@keyframes qr-appear`    | `@keyframes aparte-question-receipt-appear`  |

  The keyframes name is in the table for the same reason as the classes: animation names live
  in one global namespace too, so `qr-appear` was one `@keyframes` away from a consumer's own.
  <sub>`@aparte/plugin-ask-user`</sub>

### Patch Changes

- [1dff98c](https://github.com/apartejs/aparte/commit/1dff98c): The approval panel's options and the elicitation panel's checkboxes and radios now use
  core's own recipes instead of styling themselves.

  An approval option is `aparte-btn aparte-btn--block aparte-btn--surface`. It used to
  carry the button recipe AND a boxed `.aparte-field-choice`, which is a different thing
  — a choice row is a value you pick and then submit, an approval settles on the click —
  and, being two single-class selectors, the two sets of padding/border/radius were
  separated only by import order. Long labels now wrap instead of being held on one line.

  The 2px coloured edge on `--affirm` / `--deny` is gone, along with
  `--aparte-approval-accent-width`. A coloured rule is an alert's vocabulary, not a
  control's. Colouring the fills instead was measured and is worse: solid success gives
  2.19:1 on the dark palette. The two classes stay on the element and carry no CSS —
  they name the meaning for anyone restyling the panel.

  The option controls are `.aparte-checkbox` / `.aparte-radio`. They were native inputs
  tinted with `accent-color`, so they were the one part of the library the browser drew
  itself — a light-mode UA put a pale box on a dark row. `--aparte-elic-control-size`
  still sizes them.
  <sub>`@aparte/core`</sub>

- [b011416](https://github.com/apartejs/aparte/commit/b011416): Fixed: `_meta.artifactHint` did nothing on a non-streaming reply.

  The hint promotes a reply's first code fence to an artifact. The streaming path applies it
  twice — as the fence closes, and again at finalize — and the path for a transport whose
  `chat()` resolves a plain string applied it never. The same reply therefore rendered
  `text | code | text` through core's inline loop and `text | artifact | text` through the
  engine seam: one response, two products, decided by which transport happened to be wired.

  That is the class of defect the engine parity suite exists to prevent, and it missed this
  one because it never pairs a hint with a plain-string reply. Two tests now do.
  <sub>`@aparte/core`</sub>

- [7d11d0b](https://github.com/apartejs/aparte/commit/7d11d0b): Fixed: the artifact card's primary button failed WCAG AA on its own label.

  `.aparte-art-file__btn--primary` re-declared the fill, the border and the ink that
  `aparte-btn--primary aparte-btn--solid` already paints. Five of those declarations were
  inert duplicates; the sixth was not. `color: var(--aparte-text-inverse)` overrode
  `--aparte-btn-on-intent`, which the recipe derives from the fill — measured in a browser
  on the built stylesheet, 3.54:1 against the recipe's 5.27:1 in the light theme. It was
  also the last rule in `styles/` forcing `--aparte-text-inverse` as ink on a coloured
  fill, so a one-attribute rebrand re-derived the ink on every other solid-primary button
  and, here alone, kept core's own palette.
  <sub>`@aparte/core`</sub>

- [e06d254](https://github.com/apartejs/aparte/commit/e06d254): The tail of the cold audit: four smaller things, each verified before it was touched.

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
  <sub>`@aparte/core`</sub>

- [67d8e6b](https://github.com/apartejs/aparte/commit/67d8e6b): Two the recipe sweeps missed.

  **The badge's label was the fill.** `--aparte-badge-on-intent` answers what ink sits ON a
  solid fill, and it is derived correctly — but base, `--soft` and `--outline` paint the
  label with the raw `--aparte-badge-intent` on the PAGE background, which is a different
  question. A fill is chosen to be seen as an area; the same value as 12px text is not the
  same requirement, and on the light theme a soft warning badge came out at 1.75:1.
  `button.css` was given `--aparte-btn-intent-ink` for exactly this and the badge was not.
  Same name, same defaulting to the fill, so a custom `--aparte-badge-intent` still works;
  the five accent inks `theme.css` already derives now carry the label. `--secondary` and
  `--neutral` set no ink here either, as in `button.css`.

  **The spinner ignored `prefers-reduced-motion`.** `--aparte-duration-spin` was the one
  duration missing from the reduced-motion reset, so `.aparte-spinner`, the loading glyph
  and the select's spinner kept turning. The block's own comment says it stops motion at
  the source for the elements the descendant sweep cannot reach; it now includes the
  duration all three of them read.
  <sub>`@aparte/core`</sub>

- [94b87b7](https://github.com/apartejs/aparte/commit/94b87b7): The branch picker announces its move to a screen reader.

  The arrows deliberately do not take focus — pressing `›` should not steal the caret from
  wherever the reader was — so a live region is the only thing left to signal the change.
  There wasn't one. `.aparte-sr-only` existed in the bubble, but inside the WAITING
  indicator, written only with the locale's "typing" label, so a screen-reader user pressing
  next got a different answer with no indication that anything had happened.

  `.aparte-branch-status` is a polite live region carrying the position. It is separate from
  the visible `.aparte-branch-label` on purpose: a custom `setSiblingNavRenderer` may replace
  that label with dots, which reads as nothing. No new locale key — the position is digits,
  and the two buttons beside it already carry translated labels.

  Found by a documentation audit, and the way it survived is worth recording: the
  accessibility guide described this behaviour as if it shipped. The sentence was true of the
  design and false of the code, which is the one kind of claim no test and no guard was ever
  going to catch.
  <sub>`@aparte/core`</sub>

- [705e847](https://github.com/apartejs/aparte/commit/705e847): `<aparte-chat-bubble>`'s example now shows a branch.

  The element's `@example` had a plain bubble and a streaming one, and nothing with
  siblings — so the `‹ 1 / 2 ›` picker, which is what retry-forks-a-sibling produces and
  the whole subject of the branching guide, was never rendered anywhere on the docs site.
  `setSiblings(count, index)` is a METHOD, not an attribute, so no amount of markup could
  show it; the example needed the same small `<script>` the viewport, select and
  conversation-list examples already use.

  This is the source the docs read: the element page prints the example and its live
  preview runs that same string, so one addition gives both a picture of a branch.
  <sub>`@aparte/core`</sub>

- [682a837](https://github.com/apartejs/aparte/commit/682a837): A button's size modifier now moves its icon with it. `--aparte-btn-icon-size` was a
  fixed 16px, so the same glyph filled 80% of a `--sm` button and 44% of a `--lg` one —
  which is no longer the same icon. `--sm` and `--lg` now set it too, from the icon scale,
  keeping every size at the `--md` ratio. The comment above that rule already claimed this
  ("sized with the button so the two axes stay in step"); it now does it.

  `.aparte-action-btn` and `.aparte-art-card__btn` carried `aparte-btn--sm` AND a
  width/height of their own of 28px — which is the `--md` default the modifier was
  contradicting. They declare `--aparte-btn-size` instead and drop the modifier, so their
  icons are unchanged at 16px. Genuinely small buttons (conversation actions, the
  attachment remove) go from a cramped 16px glyph to 12px.

  Note the limit: the icon follows the size MODIFIER, not the button's pixel size. A
  component that sets `--aparte-btn-size` on its own — the send button and the
  scroll-to-bottom button, both 36px — still gets the default 16px icon.
  <sub>`@aparte/core`</sub>

- [ec309ab](https://github.com/apartejs/aparte/commit/ec309ab): The checkbox draws a checkmark, and a control sits on the line of text it labels.

  **The checkmark was a dot.** `.aparte-checkbox:checked::after` sized itself
  `inline-size: 30%; block-size: 55%` — and a percentage on a grid ITEM resolves against
  its track, which `place-content: center` on the box collapses to the content's own size.
  The content is an empty `::after`, so the track was zero and the mark computed to
  **0.59 × 1.09px**: not a check, just the 2px corner where its two borders meet. Every
  checked checkbox the library has ever rendered showed that dot. The indeterminate dash
  had it worse — 55% of zero is zero, so it drew nothing at all. Both are now `calc()` of
  `--aparte-checkbox-size` (measured back: 5.39 × 9.89px).

  **And they rode above their labels.** Checkbox, radio and switch are `inline-grid` /
  `inline-flex` boxes with no text inside, so their baseline is the bottom margin edge and
  a control next to a word sat high. `vertical-align: middle` on all three — the commonest
  way any of them is used, and it was never right.

  Found by looking at a rendered preview at 4×, then reading `getComputedStyle(el,
'::after')`. The rule reads correctly in the file, which is why passes over this sheet
  never caught it.

  Also in the class examples, which are rendered live on the reference page: the thumbnail
  row now runs large → base → small (it ran small → large), its image is a 2:3 portrait so
  `object-fit: cover` is actually demonstrated, and the two choice controls sit one per
  line instead of colliding — with no `.aparte-field-choice` wrapper, which drew a
  full-width brass box around each row when checked.
  <sub>`@aparte/core`</sub>

- [1d336d1](https://github.com/apartejs/aparte/commit/1d336d1): The two disclosure chevrons are the icon set's glyph instead of a hand-drawn CSS triangle.

  The tool-call summary and `<aparte-optgroup>` each drew their arrow with a zero-size box
  and four borders. That is not a style choice, it is a second icon mechanism: `expand`
  already exists in `glyphs.ts`, and a consumer who registers an icon provider replaced
  every other arrow in the library while these two stayed put. They now render
  `getIcon('expand')` like the rest, so the provider reaches them, and the open state
  rotates 180° rather than 90° because a chevron and a triangle do not turn the same way.
  <sub>`@aparte/core`</sub>

- [f0b9141](https://github.com/apartejs/aparte/commit/f0b9141): `<aparte-composer>`'s `setValue()` now reaches the editor, so it prefills the visible
  field instead of only staging what a send would submit.

  It used to do half of what its name says. `<aparte-composer-input>` listened for the
  composer's value but acted on the empty string alone — `if (value === '' && …)` — so
  `composer.setValue('draft')` changed what `submit()` would send while the field went on
  showing whatever was there. Worse, the value then vanished at the first keystroke,
  because every keystroke pushes the editor's real content back up. The failure was silent
  and deferred: nothing appeared, nothing threw, and the staged text was gone by the time
  anyone noticed.

  Nothing in this repo relied on it — all five examples pair `setValue(text)` with an
  immediate `submit()`, and that path is unchanged. The consumer it hurt is the one doing
  the obvious thing: a "reply with this template" button, a restored draft, a quoted
  citation.

  **The `''` special case is gone rather than widened.** The listener now compares instead:
  a value the editor already holds is not written, which is why typing does not rewrite the
  DOM under the caret — the keystroke that just travelled up comes straight back equal.
  Everything else is applied, and the post-submit clear is simply the case where that value
  is `''`. Sending attachments with no text still writes nothing, since there was nothing
  to clear.

  The comparison is against `value.trim()` because `getValue()` trims. Without that, a
  padded value never looks equal and the mirror back through `setValue` re-enters forever —
  removing the comparison in a sabotage run raises `Maximum call stack size exceeded`, and
  the test that pins the caret behaviour fails on a destroyed `<br>`.
  <sub>`@aparte/core`</sub>

- [1dff98c](https://github.com/apartejs/aparte/commit/1dff98c): Fixed: the approval panel's options rendered as 44x44 squares with their labels
  spilling out of them.

  The composer's row sized its controls with `.aparte-composer-row button` — a type
  selector, so it reached every `<button>` in the row, and a panel mounts inside that
  row. An undo rule in `base.css` used to cancel it for panel content, but both had the
  same specificity, so which one won came down to the order of two imports — and
  splitting the stylesheet into families flipped that order.

  The row now DECLARES `--aparte-btn-size` instead of restyling anything. A custom
  property inherits, so each of the composer's own controls (all icon buttons) picks the
  size up, and content that is not an icon button never sees it. Both the type selector
  and its undo are gone. `.aparte-btn` gained `box-sizing: border-box`, which the type
  selector used to supply.

  If you set `--aparte-composer-control-size`, it still wins over `--aparte-send-btn-size`
  inside the row exactly as documented — the send and action buttons read the row's value
  first and their own second, rather than being out-specified.
  <sub>`@aparte/core`</sub>

- [cbfc72e](https://github.com/apartejs/aparte/commit/cbfc72e): Nine more class families show themselves, and tiles in a row line up.

  The CSS classes reference had **10 live examples across 37 sheets**. Nine of the ten
  Display families — avatar, tag, spinner, progress, skeleton, divider, alert, card, kbd —
  reached the page as a list of class names and nothing else: a reader could learn that
  `.aparte-skeleton--text` exists and never see what it looks like. Each now carries a
  markup example in its sheet header, which is what the generator lifts into both the live
  frame and the code block beside it. **10 → 19.**

  The examples are written to exercise the thing the family is for: the avatar at three
  sizes plus a group, the progress bar determinate _and_ indeterminate, the skeleton as a
  real loading block (circle, two lines, a rect), the alert with and without a title and
  dismiss. Every glyph is core's own, verbatim from `src/icons/glyphs.ts`.

  Twenty-seven sheets still have no example and that is correct: `theme.css` declares
  tokens, `base.css` holds keyframes, `responsive.css` holds media queries, and the
  segment / component / primitive sheets style elements that already have their own
  generated preview pages. The classes page covers three groups — Controls, Display,
  Surfaces — and those are now complete.

  Also: `.aparte-thumbnail` gains `vertical-align: top`. Tiles of different sizes in one
  row aligned on the baseline, so a large tile beside two small ones pushed the small ones
  down and the row read as three unrelated things. An attachment strip mixes sizes by
  nature, so it is the common case.
  <sub>`@aparte/core`</sub>

- [4b80eab](https://github.com/apartejs/aparte/commit/4b80eab): Fixed: `setIconProvider` did not reach six of the glyphs core draws.

  The conversation row's archive tray and delete cross, the select's chevron, the attachment
  thumbnail's remove button and the artifact card's download arrow imported their glyph
  straight from `icons/glyphs.js`. A consumer who registered a provider got most of the
  library restyled and those left behind — and `archive`, `unarchive` and `download` were
  keys the provider type has always offered with no reader anywhere in the repo. In
  `artifact/card.ts` the two sat one line apart: `getIcon('copy')` above, a hardcoded glyph
  below.

  `icons/glyphs.js` is now imported by exactly one file, `config/icon-provider.ts`, which is
  what keeps this true rather than a promise to remember.

  Two dead fallbacks went with them: `getIcon()` returns the built-in glyph for any known
  key, so `getIcon('paperclip') || this._defaultIcon()` and `scrollIcon || scrollDownIcon`
  could never take their right-hand side. They read as a safety net that was not there.
  <sub>`@aparte/core`</sub>

- [0d68e65](https://github.com/apartejs/aparte/commit/0d68e65): The examples in the docs' live frames render something.

  Nine previews on the generated reference pages were empty, half-empty or nonsense, and
  they were all the same defect: an example written to be READ, rendered as a DEMO.

  Eight of them contained a literal `…` as placeholder prose — `<svg class="aparte-icon"
viewBox="0 0 24 24">…</svg>`, `<button class="aparte-btn aparte-btn--icon">…</button>`,
  and six more. That reads perfectly as "your content here" in a code block. Lifted verbatim
  into the live iframe beside it, it draws nothing: `/preview/class/icon/` was a completely
  blank frame, the thumbnail preview an empty box next to a box containing three dots.

  The ninth was `<aparte-chat>`, whose `@example` showed the element's two forms — default
  and hand-composed — one after the other, each at `height: 600px`. Every element-own example
  is concatenated into ONE frame, so the flagship element's page rendered two empty chats
  with 600px of nothing between them. It is now one chat, 320px, seeded with a real exchange;
  the hand-composed form moved into the class prose as a fenced block, where it is read and
  not mounted.

  The invariant that caused this is deliberate and stays: the frame and the code block read
  the same string, so a demo can never drift from the example above it. What changes is that
  the examples are now written for both readers at once.

  Found by photographing all 29 `/preview/*` routes and looking at them.
  <sub>`@aparte/core`</sub>

- [2bf55e1](https://github.com/apartejs/aparte/commit/2bf55e1): Three elements now document themselves with markup that runs, and one no longer shows
  Angular syntax in an HTML block.

  `<aparte-composer>` had no `@example` at all — the only element of the eighteen without
  one — so its reference page opened on an element that "renders nothing of its own, no
  default children" and never showed the markup that makes it a composer. It has the
  canonical shell/row/input/send now.

  `<aparte-chat-viewport>` and `<aparte-conversation-list>` documented themselves only
  through an imperative TypeScript example. Both are elements you place in markup and then
  drive, so each gains an HTML example that does both: the tag, then a short script that
  seeds it. The TypeScript examples stay — they were not the problem, they were half the
  answer.

  `<aparte-composer-action>`'s example was `(click)="onFavourite()"` inside a block the
  reference renders as HTML. That is Angular's binding syntax, valid in exactly one of the
  five framework targets and invalid HTML in all of them; the element's real event is
  `aparte-action-click`, and it bubbles, so the example now listens for it the way any
  framework-free page would. It also sits inside an `<aparte-composer>` now, because the
  element resolves its context with `closest('aparte-composer')` and does nothing outside
  one.

  These examples are what the documentation site's live preview renders, so an example
  that stops working is now a visibly broken demo rather than prose no one re-reads. That
  caught one on the way in: a script calling `viewport.appendMessage()` immediately after
  the tag runs before the element is upgraded, and threw.
  <sub>`@aparte/core`</sub>

- [2ed3bc8](https://github.com/apartejs/aparte/commit/2ed3bc8): Fixed: a conversation row's label fell below WCAG AA the moment you hovered it.

  The row rests at `--aparte-text-muted`, which is right on the shell's ground. Hover moves
  the ground up to `--aparte-surface-3` and the muted ink stayed where it was: 4.23:1 in the
  light theme, computed from the two hexes — an AA failure on body text, on the one row the
  pointer is over. It takes the active colour on hover now, the same value the selected row
  already uses, which measures 12.13 light and 11.71 dark.
  <sub>`@aparte/core`</sub>

- [95de449](https://github.com/apartejs/aparte/commit/95de449): Fixed: `@aparte/core/icons` shipped without types for consumers whose TypeScript
  resolves the classic way.

  `tsc` mirrors the source tree, so a nested entry emitted `dist/icons/index.d.ts` while
  Vite emitted `dist/icons.js` beside it. The package's `exports` pointed `types` at the
  nested path and both `publint` and `attw` passed on that — but a resolver that looks for
  a declaration file NEXT TO the JavaScript found none and fell back to `any`. The entry
  is flat now, so `dist/icons.js` and `dist/icons.d.ts` are siblings and every resolution
  mode agrees.

  Caught by the docs' own snippet check, which typechecks every code fence: it is such a
  consumer.
  <sub>`@aparte/core`</sub>

- [a574dfa](https://github.com/apartejs/aparte/commit/a574dfa): The light theme's status colours failed WCAG AA wherever they were TEXT, and the dark
  theme's solid buttons failed worse.

  Two defects, one cause: a colour was doing two jobs.

  **The intent as text.** `--aparte-primary`, `--aparte-info`, `--aparte-success`,
  `--aparte-warning` and `--aparte-error` were both the FILL of a solid button or a badge
  and the TEXT colour of every ghost, outline and soft button, the tool-call status, the
  field error, and `--aparte-link-color` — so every link core renders. Read as text on
  `--aparte-bg` in the light theme they measure 3.23, 3.29, 2.27, 1.92 and 3.37 against the
  4.5:1 AA asks of body text.

  An accent gains contrast by moving AWAY from its background — down on a light ground, up
  on a dark one — so one value cannot serve both themes. Five `--aparte-*-ink` tokens now
  carry the text role, per theme, and the recipes read them: the button's new
  `--aparte-btn-intent-ink` defaults to the fill, so a consumer who sets only
  `--aparte-btn-intent` is unaffected. Outline keeps the FILL on its border, which is not
  text and clears the 3:1 it has to.

  **The ink on a fill.** `--aparte-btn-ink` was `var(--aparte-text)`, which is near-black on
  light and near-WHITE on dark. `button.css` had measured white against every intent and
  rejected it in a comment — and the dark theme was silently getting it anyway. The solid
  primary button read at 1.96:1, a success badge at 2.19, and the checkbox's checkmark the
  same. `--aparte-on-intent: #14100a` is now fixed rather than theme-flipped, because the
  fills are mid-to-bright in BOTH themes; it measures 5.04 to 8.82 across the five.
  `--aparte-on-primary` stays white for `neutral`, the one intent dark enough to want it.

  Found by running axe over the docs site's live component previews. Verified the same way:
  17 page/theme pairs, from 63 contrast violations to zero. `--aparte-primary` itself is
  unchanged — it is the brand colour, and the icon tints that read it clear the 3:1 a
  graphic has to.
  <sub>`@aparte/core`</sub>

- [7f4e396](https://github.com/apartejs/aparte/commit/7f4e396): Fixed: the keyboard could not archive or delete a conversation — both keys selected it.

  `<aparte-conversation-list>`'s row is a `role="button"` div, so the component supplies
  Enter and Space for it. That handler climbed to `closest('[data-conv-id]')` from whatever
  was focused, so a press on the Archive or Delete button inside the row found the ROW,
  called `preventDefault()` — cancelling the button's own activation — and clicked the row.
  Both controls were reachable by Tab and neither could be operated: WCAG 2.1.1, on the two
  destructive actions in the list.

  The synthetic activation now stays on the one element that has no native one. An earlier
  fix had given both buttons `tabindex="0"` and a test asserting it; focusable is not
  operable, and that test only ever proved the first half. It proves both now.
  <sub>`@aparte/core`</sub>

- [9a1471e](https://github.com/apartejs/aparte/commit/9a1471e): Fixed: ten documented `@cssprop` knobs did nothing.

  When a component stopped drawing its own radius or colour and let `.aparte-btn` /
  `.aparte-field` draw it, the component's own token lost its last reader — and stayed in
  the JSDoc, so each component's generated page kept listing it. Setting
  `--aparte-radius-send-btn`, `--aparte-radius-action-btn`, `--aparte-conv-delete-radius`,
  `--aparte-conv-archive-radius`, `--aparte-elic-input-radius`,
  `--aparte-elic-step-underline`, `--aparte-action-bar-btn-color`,
  `--aparte-branch-picker-btn-color`, `--aparte-thumb-remove-bg` or
  `--aparte-thumb-remove-color` had no effect. Each now feeds the recipe that draws it, so
  all ten work again and the values they name are back — the conversation and composer
  action buttons return to their documented 4px corner.

  One of them was a visible regression, not just a dead knob: the attachment remove button
  had lost its dark scrim and its white glyph, leaving a muted ✕ directly on the picture,
  invisible over anything light.

  `.aparte-field` gained `--aparte-field-radius`. It was the only recipe that hardcoded
  its corner while every sibling names it, so a field could not be re-cornered from its
  own element the way a button or a tag can.

  `check:derived-vars` now refuses a `@cssprop` that no stylesheet reads. That is the rule
  that would have caught all ten the day they broke.
  <sub>`@aparte/core`</sub>

- [61e40da](https://github.com/apartejs/aparte/commit/61e40da): The custom-elements manifest now describes every public method, and stops describing
  three that do not exist.

  `package.json` points `customElements` at `dist/custom-elements.json` and `files` ships
  `dist`, so this file is not a docs-site input — it is what feeds editor autocomplete in
  a consumer's project. Two defects were measured in it, and both reached everyone:

  - **16 of 73 public methods carried no description at all** — the whole imperative
    surface of `<aparte-composer>` (`setValue`, `addAttachments`, `removeAttachment`,
    `clearAttachments`), all five public methods of `<aparte-composer-input>`, and
    `<aparte-chat-viewport>`'s `getMessages`. They are now documented; the count is zero.

  - **Overloaded methods shipped their implementation signature as if it were API.** A
    TypeScript overload is N declarations plus one implementation, and the analyzer emitted
    all of them: `addSegment` appeared three times, the third being
    `addSegment(messageIdOrSegment: string | AparteSegment, maybeSegment?: AparteSegment)`
    — a form no consumer may call, since its only job is to accept the other two. A new
    analyzer plugin drops the implementation and copies the docblock (which TypeScript
    accepts only on the overload declarations) onto the sibling forms, so both real calling
    conventions are documented instead of one documented and one blank.

  One behaviour is written down for the first time rather than changed: `getMessages()`
  returns the messages on the **active path**, root → head — not the whole tree, which is
  what `exportTree()` returns.

  No runtime code changed by this entry.
  <sub>`@aparte/core`</sub>

- [b7f5bab](https://github.com/apartejs/aparte/commit/b7f5bab): Three leftovers in `segment/tool-call.css` and `components/composer.css`: a
  `font-size` on `.aparte-tool-state` declared a second time thirty lines below the first,
  a comment pasted twice verbatim, a reference to a rule that had moved to another sheet,
  and `aparte-composer-attachments` declared as two rules fifteen lines apart repeating
  `display` / `flex-wrap` / `gap` at identical values. Nothing rendered differently — the
  later block simply owned those properties, so editing the earlier one changed nothing.
  One rule each now.
  <sub>`@aparte/core`</sub>

- [5cfb818](https://github.com/apartejs/aparte/commit/5cfb818): One rotation, and every stylesheet in one place.

  The library had four keyframes for a 360° turn: `aparte-spinner-spin`,
  `aparte-spin` and `aparte-icon-spin` were byte-identical, and `tool-spin` was used by
  nothing at all — and, being unprefixed, could have shadowed a rule of the same name on
  your own page. There is one now, `aparte-spin`, next to `aparte-pulse` in `base.css`
  where they are used. `aparte-spinner-rotate` stays separate on purpose: it starts at
  -90° because an SVG arc's zero is at three o'clock, so it is a different curve rather
  than a differently-named copy.

  `select.css` and `progress-spinner.css` move from `src/primitives/*/` into
  `src/styles/primitives/`, where every other sheet lives. No selector they carry appears
  in any other sheet, and their rendering is unchanged — measured before and after.

  `check:derived-vars` gained two rules, both sabotage-verified: every `animation` names
  a keyframe that exists (nothing declared `aparte-icon-spin`, so core's loading icon
  simply sat still, with no error anywhere), none is declared twice, none is dead, and all
  are prefixed. And `styles/bundle.css` — the source variant of the `./styles.css` export,
  the one list that cannot derive itself because a bundler reads it — must match
  `src/index.ts` import for import. It had already fallen a sheet behind.
  <sub>`@aparte/core`</sub>

- [e50ca32](https://github.com/apartejs/aparte/commit/e50ca32): The elicitation panel's "Other…" row lines up with the options above it.

  It is a choice row and was missing `aparte-field-choice`, the recipe every sibling row
  carries — so it had no `display: flex` and its control stacked ABOVE its own label while
  the options above it sat inline. It had no focus outline either, for the same reason: the
  recipe carries that too.

  Visible in a question with the free-text escape enabled, which is the default. Found by
  looking at a screenshot of the running panel, not by reading the code.
  <sub>`@aparte/core`</sub>

- [c236992](https://github.com/apartejs/aparte/commit/c236992): Fixed: every package accepted a `@aparte/core` it cannot actually work with.

  All fourteen declared `"@aparte/core": ">=0.7.0 <1.0.0"` while sitting at 0.12.1 and
  importing symbols core does not export before 0.11.0 (`AparteElementAttributes`,
  `AparteTemplateAttrs`, `AparteElementTagName`) or before 0.12.0 (`AparteUiEventName`) —
  read from `src/index.ts` at each release tag, not inferred. npm and pnpm both ACCEPT
  `@aparte/react@0.12.1` beside `@aparte/core@0.7.0`, say nothing, and hand you a tree
  whose types cannot compile.

  These packages are published in lockstep and are never tested apart, so the floor is the
  release. It now says so, and `pnpm version-packages` moves it with every bump — the floor
  went stale because the bump was the one place nothing updated it.
  <sub>every package</sub>

- [8fe68de](https://github.com/apartejs/aparte/commit/8fe68de): A streaming assistant message now renders incrementally on the plain-content path too, not
  only inside segments.

  `setStreamingMarkdownProvider`'s own documentation says the chat bubble uses it "to render
  the assistant message token-by-token (incremental parse + DOM append, O(n)), instead of
  re-parsing the whole string on every token", and `@aparte/plugin-streaming-markdown`'s page
  repeats it. Only the segment renderers honoured it. `<aparte-chat-bubble>`'s simple-content
  path — the one `getting-started` teaches first, through `appendMessage` / `appendToken` /
  `completeMessage` — re-parsed, re-sanitised and re-inserted the WHOLE message on every
  token.

  It uses `writeStreamedMarkdown` now, the same seam the text and thinking renderers use, so
  the promise holds on both paths. With no streaming provider registered nothing changes: the
  seam falls through to the one-shot render, which is exactly what ran before.

  The parser's cursor is dropped whenever content is REPLACED rather than appended
  (`setContent`, or the `content` attribute changing) — a retry clears the bubble and
  re-streams, and a stale cursor would slice the next delta out of the wrong string.

  Found by a cold audit. Four tests pin it, and reverting the fix fails three of them.
  <sub>`@aparte/core`</sub>

- [9122983](https://github.com/apartejs/aparte/commit/9122983): Every live preview frame shows what it promises.

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
  <sub>`@aparte/core`</sub>

- [bde11bb](https://github.com/apartejs/aparte/commit/bde11bb): A custom segment's `fallback` is drawn when no renderer claims its type.

  `AparteCustomSegment.fallback` has been published since the type existed, documented as
  "Optional fallback text representation", and read by nothing — the only two mentions in
  core were its declaration and its doc comment. A custom segment arriving somewhere its
  renderer is not registered (a conversation replayed in another app, a client that loads
  its views lazily, an exported transcript) rendered `[Unknown segment type: custom]` while
  carrying the sentence written for exactly that moment.

  It renders the fallback now, in a `.aparte-segment.aparte-segment-fallback`, as
  `textContent` — the field is filled by whoever produced the segment, which can be a
  model, so it is text and cannot carry markup. Without a fallback nothing changes: the
  same `.aparte-segment-unknown` with the same `[Unknown segment type: …]`.

  The developer warning is skipped when a fallback is present. An author who supplied one
  has already said this can happen; warning then is crying wolf. Without one it still
  fires, because a missing renderer is otherwise silent.

  Found while writing the segment's own `@example` — the documentation asked what the
  field does and the answer was nothing. The two identical unknown-segment blocks in the
  bubble are now one function.
  <sub>`@aparte/core`</sub>

- [b9e1b1b](https://github.com/apartejs/aparte/commit/b9e1b1b): Every segment interface now carries an `@example`: the literal a developer would write.

  The eight interfaces in `types/segments.ts` documented their fields — some to several
  paragraphs — and never once showed a whole segment. The field table answers "what is
  `collapsed`"; it does not answer "what does one of these look like", which is the question
  anyone emitting a segment actually has.

  Each example is a valid segment of that type, so the documentation site can print it as
  code AND render it: the segment pages now show core's own renderer drawing that exact
  literal inside a real viewport. An example that stops being a valid segment becomes a
  visibly broken preview rather than prose no one re-reads.

  The `thinking` example deliberately omits `collapsed`, because absent means CLOSED and the
  example should show what a reader gets rather than the flattering case.
  <sub>`@aparte/core`</sub>

- [8678eaf](https://github.com/apartejs/aparte/commit/8678eaf): Fixed: the default skeletons were painted with a palette core no longer uses, and a
  consumer could not override them.

  `APARTE_DEFAULT_SKELETON_FALLBACKS` carried its look in a `style=""` attribute — six
  inline declarations of Tailwind-slate hex (`#9ca3af`, `#1e293b`, `#64748b`), the exact
  palette this theme replaced. An inline style is the one thing a consumer's stylesheet
  cannot reach, so a dark-theme host got a light-grey label with no way to change it, and
  hex inside a `.ts` is invisible to `check:derived-vars`, which reads only `styles/`. The
  look now lives in `styles/display/skeleton.css` on the tokens every other recipe reads.

  They also had a second owner. `AparteConfig._defaultSkeletonRenderer` held a hand-written
  copy of the same table and the two had already drifted — `message` said "Loading
  message..." in one and "Loading..." in the other. There is one table now, and the test
  that used to explain why it could only compare content asserts identity instead.

  New classes: `aparte-skeleton-fallback`, with `--code`, `--snug` and `--tight`.
  <sub>`@aparte/core`</sub>

- [3e2afee](https://github.com/apartejs/aparte/commit/3e2afee): The readers of core's CSS derive the sheet list from `src/index.ts` instead of keeping a
  copy of it.

  That import block IS the cascade, and two readers kept a hand-written duplicate of it.
  Both had already drifted: the derived-variable guard listed the two primitive sheets but
  would not have seen a newly added one, and the docs' CSS-variable generator had neither
  — so 269 lines of declarations were absent from the published reference with nothing to
  say so. A list that has to be kept equal to an import block is a list that will not be.

  `scripts/core-stylesheets.mjs` reads the block, in order, behind a floor.
  <sub>`@aparte/core`</sub>

- [7f89fc8](https://github.com/apartejs/aparte/commit/7f89fc8): `aparte.css` is gone. Its 2573 lines of rules are ten sheets, one per family — `base`,
  `shell`, `bubble`, `composer`, `segment`, `artifact`, `elicitation`, `conversation`,
  `prose`, `responsive` — beside the `theme.css` that already held the tokens. The largest
  is now 584 lines instead of 3160, and you open the one named after what you are changing.

  The published `dist/index.css` bundles all eleven, so nothing changes for a consumer.

  **The import order in `src/index.ts` is the cascade**, which is the one thing to know
  before adding a sheet: `responsive` stays last because it overrides. Everything that
  reads the sheets reads them in that same order.

  ### What was verified, and how

  The families were interleaved — the composer alone sat in seven separate runs — so
  unlike the token extraction this could not be proved by concatenation: rules genuinely
  changed order relative to other families. A static proof turned out to have no clean
  answer (a loose collision test flags 3630 pairs, a tight one 106, and reading those 106
  shows every one impossible). So it was proved where it actually matters:

  - **the full browser suite**, 364 tests across six frameworks and three engines, passes;
  - the rule content is **identical** — 2296 significant lines, none lost, none duplicated;
  - `check:derived-vars` reports the same 135 derived declarations, 6 exemptions and 982
    references as before the split;
  - `gen-css-vars` reports the same 321 variables, 286 of them declared.

  ### Three readers went blind at once

  `check:derived-vars`, `gen-css-vars` and the test helper `read-stylesheet.ts` each
  located their corpus by a single **path**. The generator reported 6 declared tokens
  instead of 286; three unit suites went red. All three read the whole set now, in import
  order, and each carries a floor so a corpus that shrinks fails loudly instead of
  quietly publishing short.

  One more check earned its place: every sheet is asserted to have balanced comment
  markers and braces. The split cut a multi-line comment in half — its opening left in
  `segment.css`, its closing landing in `prose.css` — and that check is what finds it.
  <sub>`@aparte/core`</sub>

- [7471fb0](https://github.com/apartejs/aparte/commit/7471fb0): An error on a reply that left the active path no longer destroys what it streamed.

  `_handleLifecycleError` follows an "append the error, never replace the reply" rule — and
  implemented it with `getMessages()`, which returns only the currently ACTIVE path. So the
  rule held for the reply being streamed and silently became a full replace for any message
  that had left that path.

  A retry or an edit on an earlier bubble does exactly that to a reply still in flight: it
  stays in the tree, drops off the active path, the lookup then finds nothing, and
  `updateMessage` — which resolves ids tree-wide — overwrites every token, thinking block and
  resolved tool call with a single error segment. Nothing is visible at the time; the loss
  shows up later, when the reader opens that branch in the sibling picker and finds a bare
  error where a complete answer used to be.

  It now prefers the tree-wide `getMessage(id)`, which the viewport already exposed and the
  client's target interface simply did not declare.

  The same commit closes the asymmetry that made the race reachable: `aparte-retry` and
  `aparte-edit` reset the abort flag but, unlike `aparte-send`, never cancelled the previous
  turn's tool controllers — so a handler from the superseded turn kept running with its
  timeout counting. All three now share one `_beginUserTurn()`.

  Found by a cold audit. It survived adversarial review with one correction worth recording:
  the two shipped providers swallow `AbortError` and close quietly, so the loss is not
  reachable through them — it is deterministic on `AparteBackendTransport`, whose parser
  turns a cut connection into a thrown error.
  <sub>`@aparte/core`</sub>

- [b12e089](https://github.com/apartejs/aparte/commit/b12e089): Tabs gets its own entry, the class lists stop claiming classes they do not define, and a menu is menu-width.

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
  <sub>`@aparte/core`</sub>

- [a8ce9de](https://github.com/apartejs/aparte/commit/a8ce9de): Fixed: two `role="tablist"` that announced a pattern and shipped none of it.

  The artifact card's Code/Preview tabs and the stepped elicitation panel's step chips both
  carried `role="tablist"` with `role="tab"` children and no `aria-controls`, no
  `role="tabpanel"`, no ids to point at and no arrow keys — two sets of ordinary buttons
  wearing a role that tells a screen-reader user to expect a relationship and a keyboard
  model that were not there. A role that lies is worse than no role: as plain buttons they
  at least behaved as announced.

  Both now do what they say. Each tab points at its panel and the panel names the tab back;
  the tablist is ONE tab stop with ArrowLeft/ArrowRight/Home/End inside it, and the artifact
  card skips the Preview tab while it is disabled mid-stream rather than trapping focus on
  it. Ids are scoped — to the segment id on the card, to a per-panel counter in the
  elicitation panel — because a transcript holds many cards and a workbench holds two chats.
  <sub>`@aparte/core`</sub>

- [e8506a5](https://github.com/apartejs/aparte/commit/e8506a5): The tokens move to their own sheet: `styles/theme.css` holds the light palette, the
  dark overrides and the derived layer; `styles/aparte.css` keeps the rules. You open one
  to change a value and the other to change a look.

  The cut is a **contiguous prefix** of the old file and the new sheet is imported
  immediately before it, so the cascade cannot have moved — verified by concatenating the
  two and comparing to the original **byte for byte**. The published `dist/index.css`
  bundles both, so nothing changes for a consumer.

  Two readers had to follow, and one of them was already broken by the move:

  - `check:derived-vars` now reads every sheet **concatenated in import order**, the way a
    browser does. It had to: the anchored layer is in `theme.css` while its responsive
    overrides sit at the end of `aparte.css`, so a guard reading one file would judge half
    a rule. Its messages name the sheet and line they actually found.
  - `gen-css-vars` pointed at `aparte.css` by path and went blind — it reported **6**
    declared tokens instead of 286 and would have published a page missing 24 variables.
    It reads both sheets now, and carries a floor that fails the build if the corpus ever
    collapses again rather than quietly publishing short. That is the failure mode this
    repo has already met once, on a guard that selected its corpus by file extension.
  <sub>`@aparte/core`</sub>

- [bc86198](https://github.com/apartejs/aparte/commit/bc86198): The reasoning block wears the accordion recipe instead of redrawing it.

  A thinking segment is a disclosure — `<details>`, a `<summary>` you press, a panel, a
  chevron that turns — which is exactly what `surface/accordion.css` draws. The renderer
  drew a second one under four private classes, and it showed: the block looked unrelated
  to every other disclosure in the library.

  Worse, its chevron was the **character `▼`**. Not a glyph — a character, so it could not
  take `--aparte-icon-size`, could not be replaced through the icon provider, and rendered
  in whatever the platform font supplied. Core has had `expandIcon` in `src/icons/glyphs.ts`
  the whole time, and the accordion uses it. It is now the same glyph.

  `thinking.css` loses 33 lines of duplicated flex/reset/rotation and keeps four: the left
  rail's padding and the quieter tone, which is the only part that is about _reasoning_
  rather than about disclosure. The rendered element gains
  `.aparte-accordion__item` / `__header` / `__panel` alongside its own classes, so a
  consumer restyling either name still reaches it.

  Found by Paul asking why the thinking block did not look like the accordion. A sweep for
  the same defect elsewhere turned up one candidate — `menu.css`'s `content: '✓'` — and it
  is **kept**: it reserves an alignment gutter on every checkable item and inherits `color`,
  which forced-colors mode preserves. `▼` had neither reason and duplicated an existing
  glyph; the two are not the same case.
  <sub>`@aparte/core`</sub>

- [a453df1](https://github.com/apartejs/aparte/commit/a453df1): `AparteTool.systemPrompt` is now actually sent to the model.

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
  <sub>`@aparte/core`</sub>

- [95fadcc](https://github.com/apartejs/aparte/commit/95fadcc): Two artifact-card buttons and one transition were missed by the sweeps that tokenised
  the rest.

  `.aparte-art-card__btn:disabled` and `.aparte-art-card__tabs button:disabled` were
  still at a literal `0.4` rather than `--aparte-disabled-opacity`, so they stayed the
  two odd ones out of the unification. They were written as one-line rules
  (`{ opacity: 0.4; cursor: not-allowed; }`), and the sweep's pattern anchored `opacity`
  to the start of a line — so it never saw a declaration sitting right after the brace.
  `transition: transform 0.2s` was missed the same way and now reads
  `--aparte-duration-slow`.

  They move from 0.4 to 0.5, in line with every other disabled control.
  <sub>`@aparte/core`</sub>

- [114431c](https://github.com/apartejs/aparte/commit/114431c): `runStreamAgent`'s documentation reaches its documentation.

  The docblock describing the package's headline export sat six lines and another comment
  above the function, separated from it by the `warnUnknownStreamEvent` helper. A docblock
  that is not adjacent to its declaration is attached to nothing, so TypeDoc read the
  helper's comment as the neighbouring one and the generated `@aparte/engine` reference
  carried `runStreamAgent()` with no description at all — the export its own page
  description names first.

  The helper moves above the block. No behaviour changes; the same trap the
  custom-elements analyser has when a class docblock is pushed above an import.
  <sub>`@aparte/engine`</sub>

- [4b598f7](https://github.com/apartejs/aparte/commit/4b598f7): The question receipt's stylesheet reads core's tokens instead of its own magic
  numbers: spacing on `--aparte-space-*`, its hairline on `--aparte-border-width`, and
  its appear animation on `--aparte-duration-slow`.

  A plugin's CSS lives in a template literal because it cannot edit core's stylesheet —
  but that is a reason to reference the theme's tokens, not to restate their values. The
  receipt now follows a consumer who moves `--aparte-space-unit`, and stops at
  `prefers-reduced-motion` because the duration it reads is overridden there. No API
  change.
  <sub>`@aparte/plugin-ask-user`</sub>

- [8759de6](https://github.com/apartejs/aparte/commit/8759de6): The receipt's last two raw values read the scale: `font-weight: 600` becomes
  `--aparte-font-weight-semibold` and `font-size: 0.8rem` becomes
  `--aparte-font-size-md` (13px against 12.8px, so it moves 0.2px and now sits on a
  step). The previous pass tokenised the receipt's spacing and duration but not its
  type — the weight was still written out, which is how a plugin quietly stops
  following a consumer who restyles the chat.
  <sub>`@aparte/plugin-ask-user`</sub>

- [0632dd9](https://github.com/apartejs/aparte/commit/0632dd9): `ask-user`'s question receipt is an `.aparte-tag`. It is a pill holding a truncating
  label, which is what that recipe is, and it used to redeclare the whole thing. Its own
  CSS drops from 33 declarations to 22; the card's rule goes from 11 to 6, four of them
  now setting the tag's tokens rather than restating its properties. Nothing moves on
  screen.

  This is also the first place in the repo where a plugin reaches core's recipes, which
  is the point: they are plain classes on a stylesheet core already ships, so a plugin
  needs no import, no client and no build step to use them.

  `model-selector` no longer puts `aparte-model-selector-select` on its `<aparte-select>`.
  It carried no CSS and was queried by nothing. The element is addressable as
  `aparte-model-selector aparte-select`, which is what a consumer restyling it writes.
  <sub>`@aparte/plugin-ask-user`, `@aparte/plugin-model-selector`</sub>

- [05f3d8b](https://github.com/apartejs/aparte/commit/05f3d8b): `<AparteUi>`'s imperative handle honours `AparteUiHandle` on Vue and Svelte.

  Both packages export that interface with a docblock promising "the same
  `getElement`/`callMethod` contract on all four wrappers", and both implementations were
  non-generic: Vue's `defineExpose` took a bare object literal, Svelte's exported plain
  functions. So `getElement<HTMLInputElement>()` typed as `HTMLElement | null` there and
  correctly on React and Angular — a consumer following the documented `ref` / `bind:this`
  pattern got a type error on two of four wrappers and none on the other two.

  Found by a cold audit that compiled it rather than read it: `svelte2tsx` + `tsc` on the real
  component produced `TS2322` on the exact pattern the framework pages teach.

  Type-only — no runtime behaviour changes. Vue's emitted declaration now carries
  `getElement<T extends HTMLElement = HTMLElement>(): T | null`, matching the interface.
  <sub>`@aparte/svelte`, `@aparte/vue`</sub>

## 0.12.1

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Patch Changes

- [681bb47](https://github.com/apartejs/aparte/commit/681bb47): **The branch picker no longer collapses to "1 / 1" and lose a retry fork.** In framework-managed mode — `@aparte/react`, `@aparte/vue`, `@aparte/svelte`, `@aparte/angular` — pressing ‹ after a retry could land the sibling label on "1 / 1" instead of "1 / 2". The picker then hid itself and **the other version became unreachable for the life of the page**: the fork was gone.

  The cause was not where it was first suspected. `syncRepoFromMessages` was the obvious candidate, because it syncs from the framework's array which holds the active path only — but it never deletes, it only appends and updates, so it cannot lose a tree.

  It was `_applyPendingSiblings`. It read each sibling's bubble, `continue`d past the ones not on the page yet, and then cleared `_pendingSiblings` unconditionally — so a callback running one tick early **discarded** the branch counts with nothing left to retry. The bubble arrived a moment later showing its default of one sibling.

  Which needed a framework that renders late, and they all do. React implements `afterRender` as `requestAnimationFrame(() => cb())`: a bet that the next paint lands after React's commit. It does not always, and this repo has lost that same bet before (`25f356b`, "the stream-sync flake had a cause — a bet on rAF phase").

  The fix reschedules instead of dropping, bounded at six render passes — the race needs one, and a message that has left the active path has no bubble and never will, so an unbounded retry would hold a callback forever. **It lives in the host rather than in React's rAF call**, because any binding whose `afterRender` can precede its commit hits this, and one fix there covers all four wrappers.

  Two things this was hiding behind:

  The e2e test named _"retry forks a branch and the ‹1/2› picker navigates between versions"_ asserted `toContainText('1')` — which `"1 / 1"` satisfies exactly as well as `"1 / 2"`. It never distinguished "back to version 1 of 2" from "lost a branch", and the defect sat under a green suite through four cold audits. The strict assertion now runs on **every** mode, not just native.

  And the host's unit-test harness renders bubbles synchronously inside `setMessages`, with `afterRender: (cb) => cb()` — modelling a framework that commits during the setter, which none of the four do. `pending-siblings-race.test.ts` models the real ordering and reproduces the defect without a browser.
  <sub>`@aparte/core`</sub>

- [cd323aa](https://github.com/apartejs/aparte/commit/cd323aa): **The sanitizer's `--aparte-*` refusal can no longer be walked past with a CSS escape.**

  Core's whole theme is custom properties, so the sanitizer keeps a model-authored `--shiki-light` and refuses `--aparte-primary`: setting ours would repaint the chat around whatever element a markdown or highlight provider produced. That is defacement with the library's own paint, not highlighting.

  The refusal was spelled `!prop.startsWith('--aparte-')` and tested the name **as written**, so `--\61 parte-text` did not match and survived, and the browser decodes that ident back to `--aparte-text`.

  The asymmetry is worth naming, because it is why one of the two checks in `scrubStyle` was fine and the other was not. `SAFE_STYLE_PROPS.has(prop)` is an **allowlist**, and an escape defeats itself against one: `col\6fr` is not in the set, so the declaration dies. The custom-property test is a **denylist** — anything except ours — and an escape defeats a denylist the other way round, by making the name not match the thing being refused.

  Refused rather than decoded, which is the rule this file already applies to declaration VALUES for a stated reason: decoding is the general fix and is easy to get wrong — stripping the escape from `u\72 l(` yields `ul(`, not `url(`, which is how an earlier attempt at it passed its own test. No custom property worth setting from model-authored content needs a CSS escape.

  The fix does not rest on how any particular engine decodes anything: the invariant is that the namespace is unreachable, and it now holds because no backslash survives in a property name rather than because of a prediction about what one would become.

  Impact was bounded — custom properties inherit downward only, and `url()` / `expression()` / `javascript:` and every layout property were already refused, so this was defacement of the injected element's own subtree with no script, no beacon and no clickjack. Found by the 0.11.0 cold audit and reported as PLAUSIBLE rather than confirmed, since it rests on a spec reading no browser run was available to check; the fix is testable at our own layer, which is what made it actionable.
  <sub>`@aparte/core`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.12.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [2ac6080](https://github.com/apartejs/aparte/commit/2ac6080): **Four critical defects from the 0.11.0 cold audit.** Each one is a place where two things had to agree and nothing checked that they did.

  **A refusal's words now reach the model on the engine path too.** `runStreamAgent` hardcoded _"Tool execution was rejected by the user."_ and never read `decision.instruction` — which its own resolver type declares and core's inline loop uses. So on the recommended path (ratified decision #6), a user who refused a tool and typed "use the staging bucket instead" had those words dropped before the model saw them. Handing the model a turn after a refusal exists _so that it reads the refusal_; there was nothing to read.

  The parity suite could not see it: its resolver returned `{ approved }` and never an instruction, so both loops agreed on a case neither ran. It supplies one now, and asserts the sentence survives rather than only that the two sides match — agreement alone passes if both drop it.

  **Two chats on one page no longer fight over the presenter.** `<aparte-elicitation>` entered `<aparte-chat>`'s default composition in 0.11.0, so two plain chats each registered on the same config — which held ONE slot. The second clobbered the first (chat A's approval opened under chat B, and answering it there decided A's tool call), and when B unmounted it cleared the slot, leaving A mounted with a working presenter that never re-registered: every later approval and every `ask_user` in A rejected `no-presenter` for the life of the page, silently, because that warning fires once per config.

  It is a stack now, each entry carrying the element that registered it, and a request naming a `target` is routed to the presenter in the **same** chat. `AparteElicitationRequest.target` was already documented as "used to resolve WHICH instance presents"; the single slot is what made that impossible.

  **New:** `AparteConfig.removeElicitationPresenter(fn)` withdraws one presenter by name. `setElicitationPresenter(presenter, owner?)` takes an optional owner element. `setElicitationPresenter(null)` still means "turn it off" and clears all.

  **`hidePanel()` no longer orphans an open request.** The no-token form called the silent teardown, which nulls `onEvict` without calling it — so the documented public call closed an approval panel without telling its owner. The promise stayed pending, the approval `await` has no timeout, and because `requestUserInput` chains each request on the previous one, **no further question or approval on that config was ever presented again**. The old JSDoc justified the silent branch as "what `reset()` needs"; `reset()` calls `_evictPanel()`, which notifies. Both forms notify now, except a token-matched close — that is the owner closing its own panel, and it already knows.

  **Breaking, pre-1.0: `[multiple]="false"` used to turn multi-file selection ON.** The bindings generator modelled every boolean attribute as a _presence_ attribute, and core has two that are three-state — default on, off only via the literal `"false"`: `multiple` on `<aparte-composer-add-attachment>` and `submit-on-enter` on `<aparte-composer>`. For those, `false` REMOVED the attribute, which the element reads as true. The only value that turned it off was a string no binding could produce and no template type could express.

  `true` now writes the empty presence value and `false` writes `"false"`, and the attribute type widens to `boolean | 'false'` so OFF is expressible in React, Vue and Svelte as well. **If you passed `''`/`undefined` to force one of these off, it never worked; pass `false` (Angular) or `'false'` (templates).**

  Two attributes join the typed surface, having been read lazily via `getAttribute` and so invisible to the manifest: **`submit-on-enter`** on `<aparte-composer>` and **`action-id`** on `<aparte-composer-action>` — the latter being the only way to tell two custom composer buttons apart.

  And `aparte-action-click` now declares its detail type, so Angular's `(actionClick)` emits `AparteActionClickEventDetail` instead of `void` with `$event` discarded.
  <sub>`@aparte/core`, `@aparte/engine`, `@aparte/angular`</sub>

- [2ac6080](https://github.com/apartejs/aparte/commit/2ac6080): **Seven behavioural defects from the same audit.**

  **A tool call keeps its state word through a config change.** `relabel` rebuilt the row's badge as the icon alone, so any `setLocale`, `setIconProvider`, `registerTool` or `reset()` deleted the localized word beside it — permanently, because a settled call gets no further `update()`. "Done" went bare and pending's "Running" went empty; four of five statuses regressed. It now goes through `stateBadge`, whose own docblock claims "one function so `render` and `update` cannot disagree" and which `relabel` had never been folded into.

  **Breaking, pre-1.0: the last bare CSS class is prefixed.** The unknown-segment fallback emitted `class="segment aparte-segment-unknown"` — the rename had prefixed the second token and left the first, so 0.11.0's claim that _every_ class core emits is prefixed was false. `.segment` is Semantic UI's base layout class, which is one of the two reasons that rename happened. **If you styled `.segment`, it is `.aparte-segment` now.**

  **Three CSS rules no longer reach out of core.** `[data-status="resolved"] .aparte-tool-state` and its two siblings were the only rules in the stylesheet whose leftmost compound is an unprefixed non-element selector. A host wrapping the chat in `<div data-status="rejected">` re-tinted every completed tool call's word red. Now scoped to `.aparte-segment-tool-call`.

  **Stop in one chat no longer tears down another chat's open question.** The receive side already resolved its own chat host when no `target` attribute is set — which is all of raw core, since the documented markup sets none. The send side read the attribute only, so the abort carried `targetId: undefined`, and a missing id means "for everyone".

  **A number binding with no value no longer writes `"NaN"`.** Angular's `numberAttribute` returns `NaN` for undefined, null, `''` and any non-numeric expression, so `[scrollThreshold]="cfg.threshold"` on an unset field wrote `scroll-threshold="NaN"` — and `parseInt('NaN' || '50', 10)` is NaN because `'NaN'` is truthy, so the transcript stopped following a streaming reply and the scroll-to-bottom button never hid. `applyElementProps` removes the attribute instead, restoring the documented default. `0` still writes, because 0% is a value.

  **A CSS variable with no value is removed rather than stringified.** `props={{ '--aparte-select-bg': theme.selectBg }}` on an optional field set the property to the token `undefined` — worse than leaving it alone, because a property that is _set_ makes every `var(--x, default)` skip its fallback and become invalid at computed-value time, so the declaration is dropped and the control renders unstyled. An object became `[object Object]` the same way.

  **`@aparte/svelte`: five events are bindable again.** The `on:` surface derives from `HTMLElementEventMap`, which deliberately omits the events carrying no detail. Harmless while that only governed `addEventListener` — but declaring the tags removed `SvelteHTMLElements`' catch-all index signature, so `on:aparte-cancel` (the stop button), `on:aparte-composer-submit`, `on:aparte-reset-done`, `on:aparte-select-open` and `on:aparte-select-close` stopped type-checking. All five are Angular `@Output()`s, so the wrappers were not at parity.

  Closed by deriving from core's proxy list as well, which already enumerates every event an element dispatches on itself. `APARTE_DEFAULT_UI_EVENTS` becomes `as const` so the literals exist at the type level, and core exports the new type **`AparteUiEventName`**.

  **`@aparte/plugin-model-selector`: the framework peer ranges are fixed.** `react: "^19.2.7"` and `svelte: "^4.2.0"` were copied from the package's own devDependency pins, excluding React 18 and Svelte 5 — both supported by the matching wrappers. An out-of-range peer that is present is an ERESOLVE conflict whether or not it is optional, so installing this plugin in a Svelte 5 app failed. Now `^18.0.0 || ^19.0.0` and `^4.0.0 || ^5.0.0`, matching the wrappers.
  <sub>`@aparte/core`, `@aparte/svelte`</sub>

### Patch Changes

- [2ac6080](https://github.com/apartejs/aparte/commit/2ac6080): **Seven behavioural defects from the same audit.**

  **A tool call keeps its state word through a config change.** `relabel` rebuilt the row's badge as the icon alone, so any `setLocale`, `setIconProvider`, `registerTool` or `reset()` deleted the localized word beside it — permanently, because a settled call gets no further `update()`. "Done" went bare and pending's "Running" went empty; four of five statuses regressed. It now goes through `stateBadge`, whose own docblock claims "one function so `render` and `update` cannot disagree" and which `relabel` had never been folded into.

  **Breaking, pre-1.0: the last bare CSS class is prefixed.** The unknown-segment fallback emitted `class="segment aparte-segment-unknown"` — the rename had prefixed the second token and left the first, so 0.11.0's claim that _every_ class core emits is prefixed was false. `.segment` is Semantic UI's base layout class, which is one of the two reasons that rename happened. **If you styled `.segment`, it is `.aparte-segment` now.**

  **Three CSS rules no longer reach out of core.** `[data-status="resolved"] .aparte-tool-state` and its two siblings were the only rules in the stylesheet whose leftmost compound is an unprefixed non-element selector. A host wrapping the chat in `<div data-status="rejected">` re-tinted every completed tool call's word red. Now scoped to `.aparte-segment-tool-call`.

  **Stop in one chat no longer tears down another chat's open question.** The receive side already resolved its own chat host when no `target` attribute is set — which is all of raw core, since the documented markup sets none. The send side read the attribute only, so the abort carried `targetId: undefined`, and a missing id means "for everyone".

  **A number binding with no value no longer writes `"NaN"`.** Angular's `numberAttribute` returns `NaN` for undefined, null, `''` and any non-numeric expression, so `[scrollThreshold]="cfg.threshold"` on an unset field wrote `scroll-threshold="NaN"` — and `parseInt('NaN' || '50', 10)` is NaN because `'NaN'` is truthy, so the transcript stopped following a streaming reply and the scroll-to-bottom button never hid. `applyElementProps` removes the attribute instead, restoring the documented default. `0` still writes, because 0% is a value.

  **A CSS variable with no value is removed rather than stringified.** `props={{ '--aparte-select-bg': theme.selectBg }}` on an optional field set the property to the token `undefined` — worse than leaving it alone, because a property that is _set_ makes every `var(--x, default)` skip its fallback and become invalid at computed-value time, so the declaration is dropped and the control renders unstyled. An object became `[object Object]` the same way.

  **`@aparte/svelte`: five events are bindable again.** The `on:` surface derives from `HTMLElementEventMap`, which deliberately omits the events carrying no detail. Harmless while that only governed `addEventListener` — but declaring the tags removed `SvelteHTMLElements`' catch-all index signature, so `on:aparte-cancel` (the stop button), `on:aparte-composer-submit`, `on:aparte-reset-done`, `on:aparte-select-open` and `on:aparte-select-close` stopped type-checking. All five are Angular `@Output()`s, so the wrappers were not at parity.

  Closed by deriving from core's proxy list as well, which already enumerates every event an element dispatches on itself. `APARTE_DEFAULT_UI_EVENTS` becomes `as const` so the literals exist at the type level, and core exports the new type **`AparteUiEventName`**.

  **`@aparte/plugin-model-selector`: the framework peer ranges are fixed.** `react: "^19.2.7"` and `svelte: "^4.2.0"` were copied from the package's own devDependency pins, excluding React 18 and Svelte 5 — both supported by the matching wrappers. An out-of-range peer that is present is an ERESOLVE conflict whether or not it is optional, so installing this plugin in a Svelte 5 app failed. Now `^18.0.0 || ^19.0.0` and `^4.0.0 || ^5.0.0`, matching the wrappers.
  <sub>`@aparte/plugin-model-selector`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/react`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.11.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [f52dbe9](https://github.com/apartejs/aparte/commit/f52dbe9): **Refusing a tool no longer ends the turn.** The model gets a turn to answer in, so it reads the refusal.

  Before: a refusal appended a _"Tool execution was rejected by the user."_ tool_result and stopped the run — so the one sentence written for the model was never sent to it. Telling the assistant what you actually wanted meant retyping it as a new message, which it then read out of order.

  After: the turn's **remaining** tool calls are still skipped (the model may have asked for several, and refusing one cannot license the others — that part was a real fix and it stands), and then another turn runs.

  This needed one flag to become three states, because a refusal answers two questions differently: _run the calls that follow this one?_ — no; _take another turn?_ — yes. Core's `_handleToolUseEvent` returns `'continue' | 'respond' | 'halt'`; the engine's loop `break`s without clearing `continueLoop`. Both changed together, and the parity suite stayed green through it — which is the suite doing its job: it asserts the two loops agree, never what they do. The scenario named _"rejected stops the loop identically"_ had to be renamed by hand for exactly that reason.

  Two other outcomes are now visibly distinct from a refusal rather than sharing its exit: a per-tool turn limit, a missing handler, and an abort all `halt` and tell the model nothing.

  **If you depended on the old behaviour** — a refusal ending the run — refuse from an `approvalResolver` and stop the client yourself, or set `maxTurns: 1` on the tool.
  <sub>`@aparte/core`, `@aparte/engine`</sub>

- [e40cf78](https://github.com/apartejs/aparte/commit/e40cf78): **Breaking, pre-1.0, no shim:** a request for the human that ends without an answer now **rejects** instead of resolving `{ action: 'cancel' }`.

  `AparteElicitationResult` loses its `cancel` arm and keeps `accept` / `decline`. The failure arrives as the new `AparteElicitationAbortError`, whose `name` is `'AbortError'` — so any handler already testing `err.name === 'AbortError'` needs no change — and whose `reason` is `'aborted'` (a stopped turn, a fired signal, a question taken away by another request) or `'no-presenter'` (nothing was mounted to ask it).

  Why the shape had to change: a value is easy to handle as though it were an answer, and that is exactly what happened one level up. The tool-approval gate read `cancel` as a refusal, stamped the segment `rejected`, and told the model "Tool execution was rejected by the user." The user had pressed Stop. A rejection cannot be mistaken for a decision by a caller that forgot a branch, which is the property `cancel` never had.

  Evidence the shape is right: `askUserHandler` already performed this exact conversion by hand — `{ action: 'cancel' }` in, `new DOMException(..., 'AbortError')` out. That conversion is gone; the error now propagates from the primitive.

  **Migrating.** Replace a `case 'cancel':` branch with a `catch`. A `switch` on `action` that had all three arms keeps compiling with two, and the third path becomes the `catch`. One consequence worth knowing: a request you start and never `await` will surface an unhandled rejection when it ends without an answer, because that is what an ignored failed promise is — attach a `.catch()` if you genuinely do not care about the outcome.
  <sub>`@aparte/core`</sub>

- [ecd9ad5](https://github.com/apartejs/aparte/commit/ecd9ad5): **A tool call now shows what went in and what came out**, and it is drawn as a row rather than a badge.

  The pill named the tool and showed nothing else — not the arguments the model chose, not the result it got — while the segment carried both the whole time. Missing presentation, not missing data. It opens onto `Input` (pretty-printed JSON) and `Output`, coloured by a registered highlight provider when there is one and readable as escaped text when there is not.

  **Collapsed, always** — including while the loop waits for a decision. The reasoning block stays closed while it is being produced, which is the most live moment there is, so a tool call has no stronger claim to unroll itself. One rule, no special cases. A `<details>` appears only when there is something behind it: a disclosure onto nothing is an affordance that lies.

  **Breaking, pre-1.0: four CSS classes are renamed**, because a name in a public CSS contract must name a ROLE and not a shape — the shape belongs to whoever is styling it. `tool-pill` → `tool-label`, `tool-pill-icon` → `tool-icon`, `tool-pill-name` → `tool-name`, `tool-pill-spinner` → `tool-spinner`, `tool-pill-status` → `tool-state`. Same reasoning that retired `footer-left/center/right`: a name the design contradicts is a name that will lie.

  **And it no longer looks like a tag.** The identity is neutral at every status — it used to be filled green when a call resolved and red when it was refused, which made a finished step shout louder than the reply it belongs to. The colour lives on a small state badge at the far end, which now carries a WORD as well as a glyph (`Running`, `Done`, `Rejected`, `Stopped`): a bare cross beside a name reads as a button that removes something, so the state was being mistaken for an affordance.

  The renderer gains an `update`, which it never had. Without one the bubble replaced the element on every change — and a tool call changes status several times a turn, so a disclosure the reader opened would have slammed shut under them each time. A registered `registerToolRenderer` still owns its whole markup and is rebuilt rather than patched.

  New locale keys: `toolInput`, `toolOutput`, `toolRunning`, `toolCompleted`, `toolRejected`, `toolStopped`, translated in `@aparte/locale-fr`. New themable variable: `--aparte-tool-row-radius`.
  <sub>`@aparte/core`</sub>

- [56e1247](https://github.com/apartejs/aparte/commit/56e1247): **An open request now follows a language switch.** `AparteElicitationRequest.message` and `AparteApprovalOption.label` accept `string | (() => string)`; the function arm is re-read whenever the locale changes while the request is on screen.

  Additive — a string still behaves exactly as before, and deliberately so: a plain string is treated as the host's own wording and left alone. That is right for an app's text and wrong for locale-derived text, which is why core's own approval gate now passes functions.

  The gate was asking `Run delete_file?` over buttons reading `Approuver` and `Rejeter`. `approveTool` and `rejectTool` have been translated in `@aparte/locale-fr` since long before this: nothing was missing from the translations, the re-read path was missing. It existed while the buttons lived in the segment, and moving them to the composer left it behind.

  The tool's NAME is substituted into the question and never translated — it is the identifier the model called, wire format, so only the frame switches.
  <sub>`@aparte/core`</sub>

- [094d438](https://github.com/apartejs/aparte/commit/094d438): **The tool-approval decision moves out of the transcript and into the composer.**

  A request that blocks the run is answered where the user answers. That is now a rule for the library, not a choice made once: the composer is where a question already went, and the approval gate was the only decision surface left in a bubble. It was older than the mechanism that should have carried it — built with a segment renderer and a `document` event because neither `showPanel` nor a typed presenter existed yet — and nothing came back for it, partly because for a stretch the whole human-in-the-loop path was inert and so nothing exercised it.

  **What you see.** The `tool_call` pill stays in the transcript as the **anchor**, saying which tool is waiting, with no role, no tab stop and nothing clickable. The choices appear in the composer, each settling on the first click, above a quiet field for saying what to do instead. The thing being judged stays in the thread, which is scrollable, copyable and persisted; the panel is capped at half the viewport and could not hold a diff or a plan.

  **Breaking, pre-1.0, no shims:**

  - **`aparte-tool-decision` is deleted** — the event, `AparteToolDecisionDetail`, its event-map entry and the `document` listener that answered it. It existed only because a segment renderer has no reference to the client. To answer programmatically, pass an `approvalResolver` or register your own presenter; both see the whole request instead of an id on an event.
  - **`AparteToolApprovalResolver` and `StreamApprovalResolver` take the CALL**, `(call, signal)` rather than `(toolCallId, signal)`. You cannot ask a person "run this?" without naming what — and an id alone forced a lookup table filled by one event and read by another, the shape that breaks in silence.
  - Both resolvers may return an **`instruction`**, the words the model reads back on a refusal.
  - **`AparteElicitationRequest` gains `kind` and `options`**, and `schema` is now optional — required on a `'question'`, absent on an `'approval'`.

  **New:** `buildApprovalPanel` and `BuiltApprovalPanel`, `AparteApprovalOption` and `AparteApprovalAnswer`, and four locale keys (`approvalAsk`, `approvalWaiting`, `approvalInstructionPlaceholder`, `approvalOptionsLabel`), translated in `@aparte/locale-fr`.

  **`<aparte-chat>` now ships `<aparte-elicitation>` in its default composition.** The built-in gate asks through the presenter, so a chat without one could not honour `needsApproval` at all. An affordance core honours end to end is on by default; leaving this out would have made the gate depend on a tag nobody was told to write. Author-provided compositions are untouched, as always.

  **The options come with the request.** Core supplies two — the tool's name as the question, Approve and Reject — and anything richer is the host's: a scope option ("and always for this tool") exists only because an app wrote the label and can remember the grant. Core never invents one and never interprets one.

  **Also fixed, in passing:** a panel's own buttons inherited the composer row's 44×44 action-control sizing and rendered as circles with their labels spilling out. Any panel containing a button hit this; the approval options were the first that do.
  <sub>`@aparte/core`, `@aparte/engine`</sub>

- [5ac31ff](https://github.com/apartejs/aparte/commit/5ac31ff): **Every CSS class core emits is now prefixed `aparte-`.** Breaking, pre-1.0, no aliases: 42 names across 291 occurrences.

  `aparte-segment` `aparte-segment-content` `aparte-segment-text` `aparte-segment-thinking` `aparte-segment-code` `aparte-segment-error` `aparte-segment-tool-call` `aparte-segment-artifact-card` `aparte-segment-artifact-file` `aparte-segment-pipeline-waiting` `aparte-segment-unknown` · `aparte-tool-summary` `aparte-tool-toggle` `aparte-tool-label` `aparte-tool-icon` `aparte-tool-name` `aparte-tool-spinner` `aparte-tool-state` `aparte-tool-detail` `aparte-tool-part` `aparte-tool-part-label` `aparte-tool-part-body` · `aparte-code-content-wrapper` `aparte-code-copy` `aparte-code-filename` `aparte-code-header` `aparte-code-header-filler` `aparte-code-language` · `aparte-error-content` `aparte-error-details` `aparte-error-icon-wrapper` `aparte-error-message` `aparte-error-title` · `aparte-thinking-content` `aparte-thinking-header` `aparte-thinking-label` `aparte-thinking-toggle` · `aparte-is-streaming` `aparte-is-focused` `aparte-is-dragover` `aparte-has-content` · `aparte-pw-dot`

  If you style any of these, add the prefix. `--aparte-*` custom properties are unchanged — they were already namespaced.

  **Why it mattered in both directions.** Core is light DOM on purpose: no shadow root, so every selector reaches in and out. Inbound has bitten this project twice already — a bare `nav { justify-content: space-between }` on aparté's own docs site pushed the artifact card's tabs to opposite ends, and `.segment` is Semantic UI's base layout class. Outbound is the worse half and was never stated: these were **bare global selectors**, so `@aparte/core` shipped a rule for `.error-message`, `.code-header` and `.thinking-header` onto the whole page. Almost every site has an `.error-message`.

  The component classes were already prefixed (`aparte-message`, `aparte-composer-row`, `aparte-approval-option`, `aparte-elic-panel`); the renderer classes never were. With no written policy, the split held at 146 to 42. The policy is now in CLAUDE.md.

  One deliberate exception: `language-*` on a code block stays unprefixed, because that is the class name highlighters look for.

  Removing the `progress` segment in the same release already took out `progress-bar` and `progress-fill`, which are Bootstrap's.
  <sub>`@aparte/core`</sub>

- [c4d87a2](https://github.com/apartejs/aparte/commit/c4d87a2): A second request for the human now **waits** instead of being answered `cancel` on arrival.

  `AparteConfig.requestUserInput` holds a queue, so one request reaches the presenter at a time. That limit is real — the composer has one panel slot, and a second request used to clobber the first's DOM — but the old protection lived in `<aparte-elicitation>`, which resolved the second request `{ action: 'cancel' }` immediately. That is a refusal invented for a question nobody was ever shown, and the model reads it as the user having refused. Waiting is the honest behaviour.

  Two things this also fixes: a consumer's own presenter, registered with `setElicitationPresenter`, previously had no protection at all; and a request that has been queued while its turn is stopped is no longer presented, because asking about a run that is already over asks about nothing.

  Filed minor rather than patch for one reason worth naming: code that leaves a request unawaited and then awaits a second one used to get an immediate `cancel` and now waits for the first to settle. Nothing in this repo did that, and a dangling request is itself settled by the composer's turn-end eviction, but the shape of the change is visible enough to be a minor.

  The queue only costs a microtask when something is actually ahead: with nothing waiting, a request is still presented in the calling tick, which is what the panel being mounted synchronously depends on.
  <sub>`@aparte/core`</sub>

- [c6d3a20](https://github.com/apartejs/aparte/commit/c6d3a20): **The `progress` segment is removed.** `AparteProgressSegment`, `progressRenderer`, its registration in `registerDefaultRenderers()`, its CSS and its three `--aparte-progress-*` variables all go. Breaking, pre-1.0, with no alias and no shim.

  No language model emits a progress bar. Not chat-completions, not Anthropic's messages API, not the AI SDK's stream protocol — a model emits text, reasoning, tool calls, tool results and sometimes citations. And nothing in this repo emitted one either: the only in-repo `'progress'` is a worker→main message in `@aparte/provider-transformers` reporting **model download** progress to an `onProgress` callback, which is a name collision and never a segment.

  `label` + `percent` + `status` are the signature of an app that owns the work — word for word the reason the `terminal` segment was removed, and the sixth segment type to go for it. The line it sits on the wrong side of is visible one file away: `pipeline-waiting` stays, because **core emits that one itself** between the phases of a multi-step turn. Core-owned indicator, not app-owned data.

  An app that wants a progress bar has the seam for it: `registerSegmentRenderer` with a segment type of its own. That is the same answer this library gives for a terminal, and it is a better one than a built-in nothing fills.

  Also fixes the landing's hero, which claimed "ten kinds of content" over a list of eight. The count is computed from the list now, so it cannot drift again; it reads seven.
  <sub>`@aparte/core`</sub>

- [9e30879](https://github.com/apartejs/aparte/commit/9e30879): **Every aparté element now has a typed surface in all four frameworks.**

  Placing an element used to mean one of two things: a stringly-typed proxy, or nothing at all. In Angular it was `<aparte-ui name="aparte-model-selector" [props]="{…}" (elementEvent)="…">` — a tag name as a string, an untyped bag of props mixing DOM attributes with CSS variables, one output for every event, and an element created imperatively so no `@if`, `@for` or content projection could reach it. In React it was nine tags declared `any`.

  `@aparte/core` now declares each element's attributes once — `AparteElementAttributes`, keyed by `AparteElementTagName`, with a per-element interface exported for each. Every wrapper derives from that registry rather than listing tags, so an element added to core is typed everywhere the moment it lands.

  - **React** — the `aparte-*` JSX intrinsics are typed. A wrong value type is a compile error.

    _Amended after release:_ this said "a typo, a wrong value type, or an attribute the element does not observe is a compile error". The value half holds; the other two do not, for the hyphenated names the sentence used as its own examples. TypeScript treats a JSX attribute whose name is not a valid JS identifier as "known" even when it is absent from the attributes type, so none of the 12 hyphenated aparté attributes is typo-checked — `max-rendered-bubles={200}` compiles. Presence-attribute enforcement is unaffected.
  - **Vue** — declared through `GlobalComponents`, checked by `vue-tsc`.
  - **Svelte** — declared through `SvelteHTMLElements`, checked by `svelte-check`, including `on:` handlers derived from the DOM event map.
  - **Angular** — a standalone directive per element, exported individually and as `APARTE_ELEMENT_DIRECTIVES`. Real `@Input()`s that write attributes (never properties — eight of `<aparte-composer>`'s accessors are getter-only), one typed `@Output()` per event emitting the event's detail, and the real tag in the template so control flow and projection work. It also means **no `CUSTOM_ELEMENTS_SCHEMA`**, which used to switch template checking off for every unknown tag in the file.

  In the three template languages a presence attribute is `'' | null | undefined`, not `boolean`: all three stringify what they set on a custom element, so `searchable={false}` would render `searchable="false"` and an element testing `hasAttribute` reads that as on. Angular's directives take a real `boolean` and write the attribute themselves. `AparteTemplateAttrs` and `AparteAttrValue` are exported if you build your own integration.

  `<aparte-ui>` is unchanged and still ships. It is the escape hatch for an element aparté does not define — one of yours, or a third party's — rather than the way to use aparté's own.

  Also fixed while typing it, all found by the compiler rather than by reading: six attributes were documented as strings while the element treats them as booleans or numbers; `timestamp` accepts a number as well as a string; `framework-managed` is a real attribute of the contract that all four wrappers set, core reads on two elements, and nothing declared; and `max-messages` is marked deprecated in favour of `max-rendered-bubbles`, which the element has been warning about at runtime.

  New docs page: [Placing elements, typed](/frameworks/elements/).
  <sub>`@aparte/core`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [2f6180e](https://github.com/apartejs/aparte/commit/2f6180e): **A wrapper types only what it depends on.** `AparteModelSelectorDirective` and `AparteAskUserDirective` are removed from `@aparte/angular`; `aparte-model-selector` and `aparte-ask-user` are removed from core's `AparteElementAttributes` registry, along with the `AparteModelSelectorAttributes` export; and `aparte-model-change` is removed from `APARTE_DEFAULT_UI_EVENTS`.

  They were added hours earlier in the same release, and the reason to take them back out is the one that matters: **a third-party plugin's author cannot add a line to `@aparte/core`.** Typing our own plugin's element from core and shipping its directive from the wrapper gave aparté's packages a privilege nobody else's plugin could have — an asymmetry baked into the library before it has an ecosystem.

  The rule that replaces it is symmetric and states in one line: **whoever owns the element owns its contract and its bindings.** Core's elements are typed by core and wrapped by the wrappers. Everything else — a plugin's element, ours or yours — is typed by its owner, or in six lines by the app that places it. Both mechanisms are documented, and both are exactly the same work for us as for anyone: module augmentation for React/Vue/Svelte (types only, no runtime, applies exactly when the package is installed) and a directive for Angular, whose only non-obvious part — attribute versus property — is `applyElementProps`, already exported.

  Nothing about core's own 18 elements changes: their attributes, the 26 declared events with 20 typed details, the JSX/Vue/Svelte typing and the 17 Angular directives all stay.

  The Angular example keeps its `CUSTOM_ELEMENTS_SCHEMA` removed.

  _Amended after release:_ this said the example "now declares its own six-line directive for the model selector instead of importing one". It does not — it imports the directive from `@aparte/plugin-model-selector/angular`. The plugin shipped that subpath later in the same release and the example was switched back to it, but this paragraph was not re-measured before publishing. The pattern itself is documented, with a worked example, at `/frameworks/elements/#your-own-element-or-a-plugins`.
  <sub>`@aparte/core`, `@aparte/angular`</sub>

- [16bcd8a](https://github.com/apartejs/aparte/commit/16bcd8a): **`@aparte/plugin-model-selector/angular`** — the fourth and last binding, so all four frameworks now get `<aparte-model-selector>` from the package that owns it.

  ```ts
  import { AparteModelSelectorDirective } from "@aparte/plugin-model-selector/angular";
  // @Component({ imports: [AparteModelSelectorDirective], … })
  ```

  Angular is the only one of the four that needs real code — its template compiler requires a class claiming the selector, and `[persist]="true"` on a custom element writes a _property_, which on an attribute-driven element is a silent no-op. So this entry is compiled in **partial-Ivy** mode by `ngc`, the format a consumer's own AOT build finishes, while Vite keeps building everything else. The directive itself is generated from the package's own custom-elements manifest, like the other three bindings.

  `@angular/core` is an **optional** peer dependency: install the plugin without Angular and nothing here is reachable, which is the point.

  The Angular example now imports this instead of the six-line local directive it wrote while waiting — the import resolving at all _is_ the property, since you get the binding exactly when you have the plugin. That local directive remains the documented path for an element aparté does not define.
  <sub>`@aparte/plugin-model-selector`</sub>

- [d03b212](https://github.com/apartejs/aparte/commit/d03b212): **`@aparte/plugin-model-selector` types its own element**, through three new subpath exports: `./react`, `./vue` and `./svelte`.

  ```ts
  import "@aparte/plugin-model-selector/react";
  // <aparte-model-selector persist="" searchable="" placeholder="Pick a model" />  ← typed
  ```

  This is the rule from the previous release made real: whoever owns the element owns its contract and its bindings. `@aparte/angular` briefly shipped a directive for this element and core briefly typed it — both were removed, because a third-party plugin's author cannot add a line to either, so doing it for our own plugin gave aparté's packages a privilege theirs could never have.

  Putting the bindings in the plugin makes the property you actually want fall out of the module graph: **install the package and the tag is typed; don't and it isn't.** TypeScript enforces that, nobody has to remember it.

  Subpaths rather than the main entry because a `declare module 'react'` block only compiles where React's types resolve — in a shared entry it breaks every Vue and Svelte consumer with `TS2664`. `react`, `vue` and `svelte` are **optional** peer dependencies; the three modules carry no runtime at all (0.04 kB each, the augmentation is the whole payload).

  The package now also emits its own custom-elements manifest, and its attribute types are generated from it by the same `scripts/gen-element-bindings.mjs` that generates core's — so the types cannot fall behind the element's JSDoc, and a third-party plugin can run the same tool on its own manifest.

  No Angular subpath yet: an Angular directive is runtime code, so it needs partial-Ivy compilation in a package that builds with Vite. Until then, the six-line local directive the Angular example demonstrates is the path.
  <sub>`@aparte/plugin-model-selector`</sub>

### Patch Changes

- [7336ae4](https://github.com/apartejs/aparte/commit/7336ae4): **A built-in renderer's CSS moved out of `getStyles()` and into `styles/aparte.css`** — the tool call, the artifact card and the pipeline-waiting segment, 425 lines out of the three
  renderers and 449 into the stylesheet (the difference is section comments and blank lines a real
  stylesheet gets to have). No visual change: the same rules, in a file that ships the same way.

  `getStyles()` stays on the renderer interface, because that seam is what a _consumer's_ renderer needs — something registered through `registerSegmentRenderer` or `registerToolRenderer` cannot edit core's stylesheet and has no other way onto the page. A built-in has the stylesheet.

  Two measured reasons. `check:derived-vars` reads that one path and nothing else, so a declaration deriving from another variable could hide in a renderer unchecked. And CSS in a template literal is not read as CSS: a backtick closes the literal — the artifact card's own comment recorded that happening, and it happened three more times in one sitting, the worst rendering a source marker into an assistant's bubble as prose, because inside a template literal a `//` comment is just text.

  Also removes a dead rule that tinted the tool row's border while a decision was pending: it stopped painting anything when that border went away in the row redesign, and it reached for `--aparte-border-strong`, a variable that was never declared anywhere.

  Contract-neutral: core's entry imports the stylesheet and `package.json` marks every `.css` a side effect, so importing `@aparte/core` has always brought it along.
  <sub>`@aparte/core`</sub>

- [02f2d4d](https://github.com/apartejs/aparte/commit/02f2d4d): The composer's one panel slot now has an owner, which closes a defect that could permanently stop a chat from asking anything.

  `showPanel` returns a token and accepts an `onEvict` callback; `hidePanel(token)` closes the panel only if that token still owns the slot. Both additions are additive — code that calls `showPanel()` and `hidePanel()` as before is unchanged.

  The defect: the composer tears its panel down on **every** turn-ending event, and `<aparte-elicitation>` only listened for `aparte-message-error` and `aparte-message-aborted`. A question still open when a turn completed normally therefore lost its panel while the presenter kept its pending state — so `requestUserInput()` never settled, and because the presenter refuses a second request while one is pending, every later question was short-circuited for the life of the page. One finished turn and the chat could never ask again.

  Three paths could close a panel whose owner was still awaiting an answer, and none of them told the owner: a second `showPanel`, the owner's own late `hidePanel`, and the turn-end teardown. All three now notify, and a presenter settling late can no longer tear down the panel that replaced its own.
  <sub>`@aparte/core`</sub>

- [093a196](https://github.com/apartejs/aparte/commit/093a196): **The element bindings are generated from the manifest, not written by hand.** 675 lines of
  hand-maintained declarations out — 435 of Angular directives and 240 of attribute interfaces — for a
  335-line generator and a 55-line config file, which three packages now share.

  Core's attribute registry and the 17 Angular directives were a parallel structure over facts the custom-elements manifest already carried, with nothing watching them. Add an attribute to an element and the manifest records it, the registry records it, and React, Vue and Svelte type it automatically — they derive from the registry through a mapped type. Angular would silently not, because an `@Input()` is a hand-written member. Nothing would go red, and the Angular wrapper would be quietly behind within days.

  `scripts/gen-element-bindings.mjs` now emits both from `dist/custom-elements.json`, into gitignored `src/generated/` directories rewritten on every build — the same pattern the docs' two generated reference pages already use, so there is no committed artifact that can fall behind and no new guard.

  The generator was checked differentially against the output it replaced, and reproduced it: the same 15
  interfaces carrying the same 48 attribute members, the same 17 directives, the same 24 Outputs. It
  differs in exactly one place — 41 Inputs where the hand-written directives had 40, because it picked
  up `framework-managed` on `<aparte-chat-viewport>`, an attribute core's registry declared and the
  hand-written directive had missed. That is the drift this change exists to make impossible, found in
  the artefact being deleted. The 109 directive tests pass unchanged against the generated file.

  What cannot be derived lives in `packages/core/element-bindings.config.mjs`, visible rather than buried in a generator branch: `role` on the bubble is omitted as an Input because that name is ARIA's, `data-empty` on the toolbar is omitted because the element reflects it onto itself, and `aparte-abort` / `aparte-message-aborted` get no Output because they are dispatched on `window` where a host listener could never hear them.

  No public API changes: the same types and the same directive names are exported, from a generated file instead of a hand-written one.
  <sub>`@aparte/core`, `@aparte/angular`</sub>

- [e406a98](https://github.com/apartejs/aparte/commit/e406a98): **Every element now declares and describes its own surface**, and the generated API reference prints each event's detail type.

  The manifest is the source of truth for the component API, and it was quietly incomplete. Four elements carried a full `@element` / `@attr` / `@fires` block at the top of their file, separated from the class by imports and interfaces — TypeScript associates only the comment physically adjacent to a declaration, so every authored description was dropped on the floor. Nothing _looked_ missing: the analyser reads `observedAttributes` and `this.dispatchEvent` structurally, so `<aparte-select>` still listed six attributes and three events. They just had no text, and the reference page shipped rows like `| aparte-cancel |  |`.

  Seven event names reached the manifest through neither path and are now declared by hand, because no docblock fix can make them detectable: the analyser's fallback only visits real method declarations and only recognises `this.dispatchEvent`. `<aparte-conversation-list>` had **no events at all** — all four of its dispatches happen in an arrow class field. `<aparte-chat-bubble>` was missing exactly one, `aparte-branch-navigate`, for the same reason. `<aparte-composer>` was missing `aparte-abort` and `aparte-message-aborted`, which go out on `window`.

  Every event that carries a detail now names its type — `@fires {CustomEvent<AparteConversationSelectDetail>} …` — sourced from `event-map.ts`, which is guarded in both directions. Before this, all 26 events in the manifest read as a bare `CustomEvent`; there was no working typed instance in the repo. The generated reference gained a **Type** column to print it, because that is what tells a consumer the shape of `e.detail`.

  Result: 18 elements, every one with a description, every attribute and event described, 26 events of which 20 carry a typed detail.
  <sub>`@aparte/core`, `@aparte/plugin-ask-user`, `@aparte/plugin-model-selector`</sub>

- [6f262cf](https://github.com/apartejs/aparte/commit/6f262cf): Three fixes to the human-in-the-loop gate. No API changes: nothing that compiles today stops compiling.

  **A stop is no longer reported to the model as a refusal.** Pressing Stop while a tool waited for approval stamped the segment `rejected` and put "Tool execution was rejected by the user." into the history — the sentence the model reads named a decision nobody made. The abort path resolved `{ approved: false }`, the same value an explicit Reject produces, so the gate could not tell them apart. It now asks the signal instead of the value, and an aborted wait stamps `aborted` and appends no `tool_result`: there is nothing true to tell the model, which is already how a handler aborted mid-run is treated.

  **A `needsApproval` tool with no `approvalResolver` aborts instead of inventing a refusal.** `runStreamAgent` defaulted to `async () => ({ approved: false })`, so a host that had simply forgotten to wire a resolver was reported to the model as having refused.

  **A reloaded conversation stops waiting for a decision nobody can give.** A `tool_call` persisted as `awaiting-approval` came back still awaiting it, with Approve / Reject buttons wired to a listener that went with the page — and `isSegmentSettled` reads _status_ for a tool call, so the segment also stayed open and collected an `endedAt` from the next turn-close. `adoptSegment` now normalises it to `aborted` on every load path: nobody refused it, the page simply went away. The persistence guide documented this as something core could not fix for you; that half of the paragraph is gone, and `pending` — the same defect on the sibling nobody had looked at — is named as still outstanding.

  **`AparteToolDecisionDetail.targetId` is declared.** The runtime always sent it and a test read it, so reaching the chat id on a public event required casting past its own type.
  <sub>`@aparte/core`, `@aparte/engine`</sub>

- [d85cf6b](https://github.com/apartejs/aparte/commit/d85cf6b): **`APARTE_DEFAULT_UI_EVENTS` now lists every event an aparté element dispatches on itself** — 23 names, up from 7.

  This is the set `AparteUi` forwards in all four wrappers, so an event missing from it is an event a consumer cannot hear through the proxy. It described itself as "verified against core" while carrying seven of twenty-three, and the gap was not academic: `aparte-model-change` was absent, and `<aparte-ui name="aparte-model-selector">` was the one worked example in the wrappers' own documentation — the documented usage could not receive the event it exists to receive.

  That example is gone from this release for a better reason than a longer list: `@aparte/plugin-model-selector` now types its own element and ships its own bindings, so its event is typed through the DOM and the proxy is not on the path at all. `aparte-model-change` is therefore _not_ in this list — a plugin's event is the plugin's to declare, and core listing it was the same privilege the boundary change removed everywhere else.

  Two of core's own events are also deliberately excluded: `aparte-abort` and `aparte-message-aborted` go out through `window.dispatchEvent`, so an element-level listener can never receive them and listing them would promise a forward that cannot happen. That is the whole difference between the manifest's 25 distinct event names and this list's 23.
  <sub>`@aparte/core`</sub>

- [e40cf78](https://github.com/apartejs/aparte/commit/e40cf78): **Breaking, pre-1.0, no shim:** a request for the human that ends without an answer now **rejects** instead of resolving `{ action: 'cancel' }`.

  `AparteElicitationResult` loses its `cancel` arm and keeps `accept` / `decline`. The failure arrives as the new `AparteElicitationAbortError`, whose `name` is `'AbortError'` — so any handler already testing `err.name === 'AbortError'` needs no change — and whose `reason` is `'aborted'` (a stopped turn, a fired signal, a question taken away by another request) or `'no-presenter'` (nothing was mounted to ask it).

  Why the shape had to change: a value is easy to handle as though it were an answer, and that is exactly what happened one level up. The tool-approval gate read `cancel` as a refusal, stamped the segment `rejected`, and told the model "Tool execution was rejected by the user." The user had pressed Stop. A rejection cannot be mistaken for a decision by a caller that forgot a branch, which is the property `cancel` never had.

  Evidence the shape is right: `askUserHandler` already performed this exact conversion by hand — `{ action: 'cancel' }` in, `new DOMException(..., 'AbortError')` out. That conversion is gone; the error now propagates from the primitive.

  **Migrating.** Replace a `case 'cancel':` branch with a `catch`. A `switch` on `action` that had all three arms keeps compiling with two, and the third path becomes the `catch`. One consequence worth knowing: a request you start and never `await` will surface an unhandled rejection when it ends without an answer, because that is what an ignored failed promise is — attach a `.catch()` if you genuinely do not care about the outcome.
  <sub>`@aparte/plugin-ask-user`</sub>

- [ecd9ad5](https://github.com/apartejs/aparte/commit/ecd9ad5): **A tool call now shows what went in and what came out**, and it is drawn as a row rather than a badge.

  The pill named the tool and showed nothing else — not the arguments the model chose, not the result it got — while the segment carried both the whole time. Missing presentation, not missing data. It opens onto `Input` (pretty-printed JSON) and `Output`, coloured by a registered highlight provider when there is one and readable as escaped text when there is not.

  **Collapsed, always** — including while the loop waits for a decision. The reasoning block stays closed while it is being produced, which is the most live moment there is, so a tool call has no stronger claim to unroll itself. One rule, no special cases. A `<details>` appears only when there is something behind it: a disclosure onto nothing is an affordance that lies.

  **Breaking, pre-1.0: four CSS classes are renamed**, because a name in a public CSS contract must name a ROLE and not a shape — the shape belongs to whoever is styling it. `tool-pill` → `tool-label`, `tool-pill-icon` → `tool-icon`, `tool-pill-name` → `tool-name`, `tool-pill-spinner` → `tool-spinner`, `tool-pill-status` → `tool-state`. Same reasoning that retired `footer-left/center/right`: a name the design contradicts is a name that will lie.

  **And it no longer looks like a tag.** The identity is neutral at every status — it used to be filled green when a call resolved and red when it was refused, which made a finished step shout louder than the reply it belongs to. The colour lives on a small state badge at the far end, which now carries a WORD as well as a glyph (`Running`, `Done`, `Rejected`, `Stopped`): a bare cross beside a name reads as a button that removes something, so the state was being mistaken for an affordance.

  The renderer gains an `update`, which it never had. Without one the bubble replaced the element on every change — and a tool call changes status several times a turn, so a disclosure the reader opened would have slammed shut under them each time. A registered `registerToolRenderer` still owns its whole markup and is rebuilt rather than patched.

  New locale keys: `toolInput`, `toolOutput`, `toolRunning`, `toolCompleted`, `toolRejected`, `toolStopped`, translated in `@aparte/locale-fr`. New themable variable: `--aparte-tool-row-radius`.
  <sub>`@aparte/locale-fr`</sub>

- [094d438](https://github.com/apartejs/aparte/commit/094d438): **The tool-approval decision moves out of the transcript and into the composer.**

  A request that blocks the run is answered where the user answers. That is now a rule for the library, not a choice made once: the composer is where a question already went, and the approval gate was the only decision surface left in a bubble. It was older than the mechanism that should have carried it — built with a segment renderer and a `document` event because neither `showPanel` nor a typed presenter existed yet — and nothing came back for it, partly because for a stretch the whole human-in-the-loop path was inert and so nothing exercised it.

  **What you see.** The `tool_call` pill stays in the transcript as the **anchor**, saying which tool is waiting, with no role, no tab stop and nothing clickable. The choices appear in the composer, each settling on the first click, above a quiet field for saying what to do instead. The thing being judged stays in the thread, which is scrollable, copyable and persisted; the panel is capped at half the viewport and could not hold a diff or a plan.

  **Breaking, pre-1.0, no shims:**

  - **`aparte-tool-decision` is deleted** — the event, `AparteToolDecisionDetail`, its event-map entry and the `document` listener that answered it. It existed only because a segment renderer has no reference to the client. To answer programmatically, pass an `approvalResolver` or register your own presenter; both see the whole request instead of an id on an event.
  - **`AparteToolApprovalResolver` and `StreamApprovalResolver` take the CALL**, `(call, signal)` rather than `(toolCallId, signal)`. You cannot ask a person "run this?" without naming what — and an id alone forced a lookup table filled by one event and read by another, the shape that breaks in silence.
  - Both resolvers may return an **`instruction`**, the words the model reads back on a refusal.
  - **`AparteElicitationRequest` gains `kind` and `options`**, and `schema` is now optional — required on a `'question'`, absent on an `'approval'`.

  **New:** `buildApprovalPanel` and `BuiltApprovalPanel`, `AparteApprovalOption` and `AparteApprovalAnswer`, and four locale keys (`approvalAsk`, `approvalWaiting`, `approvalInstructionPlaceholder`, `approvalOptionsLabel`), translated in `@aparte/locale-fr`.

  **`<aparte-chat>` now ships `<aparte-elicitation>` in its default composition.** The built-in gate asks through the presenter, so a chat without one could not honour `needsApproval` at all. An affordance core honours end to end is on by default; leaving this out would have made the gate depend on a tag nobody was told to write. Author-provided compositions are untouched, as always.

  **The options come with the request.** Core supplies two — the tool's name as the question, Approve and Reject — and anything richer is the host's: a scope option ("and always for this tool") exists only because an app wrote the label and can remember the grant. Core never invents one and never interprets one.

  **Also fixed, in passing:** a panel's own buttons inherited the composer row's 44×44 action-control sizing and rendered as circles with their labels spilling out. Any panel containing a button hit this; the approval options were the first that do.
  <sub>`@aparte/locale-fr`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-marked`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`.</sub>

## 0.10.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [b4f2435](https://github.com/apartejs/aparte/commit/b4f2435): **Fixed: a derived CSS variable now follows a master you override.** Per-instance
  theming works, and core's own dark theme stops painting from a palette it had left.
  Visible change in dark mode — read the last section before upgrading.

  A custom property is substituted where it is **declared**. 79 of core's declarations
  read another variable, and all 79 lived in `:root, :host` alone — so each was computed
  once against the root palette, and everything below merely inherited the result. Two
  consequences, neither of which produced an error:

  - **`--aparte-primary` on one `<aparte-chat>` moved the send button and nothing else.**
    The accent, the avatar, the focus ring and the radii are derived, so they kept the
    root's brass. Per-instance theming was documented and did not work.
  - **`[data-aparte-theme="dark"]` overrides eight masters and re-declared none of the
    derived layer**, so dark mode kept light-substituted values. Invisible in the obvious
    place — both brasses are brass — and _not_ invisible in 24 others, which had been
    papered over with hardcoded dark literals: `#1e293b`, `#334155`, `#475569`, `#94a3b8`,
    the Tailwind slate ramp, against a dark theme whose own surfaces are `#17141c` /
    `#211b28` / `#2a2333` (purple-ink). Code blocks, reasoning, the input and the
    conversation list rendered in a different colour family from the rest of the chat.
    Two owners for one value, and they had already drifted.

  **What changed.** The derived layer is now its own block, declared at every anchor where
  a palette can change:

  ```css
  :root, :host, [data-aparte-theme], [data-aparte-host], aparte-chat { … }
  ```

  Substitution re-runs there, against that element's own masters. The 24 stale dark
  literals are deleted — the derivation owns those values now, so the dark block is back
  to what a theme should be: **18 literal master overrides** (backgrounds, bubbles, text,
  border, primary, one shadow, the error palette) and nothing else.

  The literal palette deliberately stays on `:root, :host`. Widening _that_ list looks
  like the same fix and is not: it would re-declare the light literals on an
  `<aparte-chat>` nested in a dark wrapper, where a local declaration beats the inherited
  dark value, and the chat would silently go light. Both halves are now enforced by
  `pnpm check:derived-vars`, with the browser half in `e2e/tests/theming.spec.ts` — jsdom
  does not resolve `var()`, so no unit test can see any of this.

  **Upgrading.** If you set a master (`--aparte-primary`, `--aparte-surface-*`,
  `--aparte-text*`, `--aparte-border`) anywhere, more of the UI now follows it — that is
  the fix. If you were compensating for the old behaviour by also setting a derived
  variable by hand, drop the compensation; setting the master is enough. In dark mode,
  code blocks, reasoning blocks, the composer field and the conversation list change
  colour: they now derive from your dark surfaces instead of the abandoned slate values.
  To keep a specific one exactly as it was, set that variable yourself — a value you
  declare still wins.
  <sub>`@aparte/core`</sub>

- [fd192e6](https://github.com/apartejs/aparte/commit/fd192e6): **A config change now reaches the composer, and `subscribeConfigChange` is the hook for your own elements.**

  The docs promise that "a locale switch is live: mounted components re-render
  immediately". It was half true. Twenty-one files read a config-derived value — an
  icon, a locale string — at render time, and sixteen never re-read it. Among them all
  four composer controls and the input, each of which renders once behind an
  early-return guard, so an icon set or a language chosen after the first render never
  reached them.

  Most of that surface is **invisible**: accessible names and tooltips. Only the
  input's placeholder is text a sighted user reads. That is why it went unnoticed —
  nothing on screen was ever in the wrong language.

  **New: `subscribeConfigChange(el, handler)`** (exported, and from the Node entry
  too). It owns the event name — previously a string literal repeated in five
  components — and the scope rule that decides whether a change belongs to _this_
  element. The config is resolved per event, never captured when subscribing:
  `AparteChatStatus` documents why, having been made "permanently deaf to its own
  instance" by exactly that mistake.

  **Fixed, with a targeted refresh in each — never a re-render:**

  - `aparte-composer-input` — the placeholder and its accessible name.
  - `aparte-composer-send` — the icon and label for whichever of its four meanings the
    button currently carries. It remembers the last `panel-change` payload now, which
    it previously read out of the event's arguments and discarded, so nothing could
    recompute the chrome afterwards. Its streaming label was the bare literal `'Stop'`
    and is localized.
  - `aparte-composer-cancel` — icon and accessible name, without touching `hidden`.
  - `aparte-composer-add-attachment` — icon, label, tooltip.
  - `aparte-composer-action` — icon only: its label is the consumer's `label`
    attribute, so a locale change is correctly a no-op there.
  - the bubble's **avatar provider**, which was the one provider a live change never
    reached — swap the set and every bubble already on screen kept the old one.

  Why targeted and not a re-render: `_render()` returns early once its button exists,
  and its own disabled/hidden/mode computation ignores state that lives on the composer
  root. Rebuilding would put a send glyph back while a reply was still streaming,
  un-hide a stop button, drop out of answer mode with a question panel open, and take
  the focus off the control most likely to be holding it.

  Ten tests, both halves seen to fail: disabling the seam reddens nine of ten, and
  removing the send button's mode dispatch reddens exactly its two streaming cases.

  **Still stale, and deliberately not in this change:** the segment renderers'
  config-derived text (a code block's copy button, a tool call's Approve/Reject, a
  terminal's labels). Refreshing them by re-rendering the segments container was
  audited and rejected — it destroys a running artifact preview, reverts a reasoning
  block a reader had expanded, resets scroll inside long panes, and does not even
  localize the strings that were never routed through `t()` in the first place. It
  needs a narrow `relabel` hook on the renderer contract, which is its own change.
  `aparte-elicitation` and the model-selector plugin are also still to do, each for a
  specific reason recorded in that audit.
  <sub>`@aparte/core`</sub>

- [0fc38d8](https://github.com/apartejs/aparte/commit/0fc38d8): **A live config change now reaches an open question and the model selector.** They were
  the last two components a language switch could not touch, and each was stuck for a
  different reason.

  **The elicitation panel kept no reference to itself.** `Pending` held
  `{ settle, composer }`, so when the locale changed there was nothing to relabel — the
  question a user was looking at stayed in the previous language. Rebuilding was never the
  alternative: the reader may be halfway through typing an answer, or three questions into
  a form.

  So `BuiltElicitationPanel` gains **`relabel()`**, bound by the same rule as a segment
  renderer's: text and attributes only, no node added or removed. The panel collects one
  closure per string it takes from the locale, _while it is being built and only when it
  takes it_ — which is what keeps a `trueLabel` the tool supplied from being overwritten
  by `elicitationYes`. Four sites: the "Other…" option (title, placeholder and accessible
  name), the yes/no labels, and the last-resort answer label. The presenter keeps the panel
  and its Skip button in `Pending`, subscribes with the public
  `subscribeConfigChange`, and re-texts both.

  Asserted in pairs — the strings moved, _and_ a half-typed answer is still there, in the
  same node.

  **Fixed in passing, found by one of those tests:** an elicitation with an empty
  `message` gave its input `aria-label=""` — no accessible name at all. The chain was
  `field.title ?? field.description ?? fallbackLabel ?? t('elicitationAnswerLabel')`, and
  `??` treats `''` as a value, so an empty message won. It is `||` now: an empty title is
  not a name.

  **The model selector was subscribed, and guarded past it.** Its handler returns early
  unless the _model_ config changed, so a language switch reached it and was dropped —
  leaving `modelSelectorPlaceholder`, the one string it takes from the locale and the only
  one visible before the list is opened, in the previous language.

  The guard stays, because it earns its place: a full re-render re-loads every provider's
  models asynchronously and would close an open dropdown and discard a typed search. What
  it gained is a cheap path — one attribute, in place. Measured with a MutationObserver
  rather than claimed: with the fix, a language switch produces exactly one mutation,
  `attr:placeholder`; without it, **zero** — which is the defect, stated as a measurement.
  An explicit `placeholder` attribute still wins, as it does at render time.
  <sub>`@aparte/core`, `@aparte/plugin-model-selector`</sub>

- [cd188f7](https://github.com/apartejs/aparte/commit/cd188f7): **The language lever, finished: four more strings, and the clock.** Additive — five new
  optional keys, one of which is not a string at all.

  Both halves were found by a person switching the language in a browser and reading the
  screen, after a cross-check of every key core reads against every key it declares had
  already been run. The list said nothing was missing; the screen disagreed twice.

  **`actionUpload` was read and never declared.** `aparte-composer-add-attachment` has
  called `t('actionUpload')` since it existed, and no locale ever declared that key — so
  `t()` returned `''` and the `|| 'Attach file'` fallback rendered in every language, after
  every reload. That is the **third** instance of this exact defect, after `submitButton`
  and `stopButton`. A key read and not declared is invisible from either side: the
  component looks correct and the locale looks complete. Only cross-checking the two lists
  finds it, and that check is now the routine.

  Three more that were plain literals: the artifact preview pane's one sentence
  (`previewPending`), and the sandbox failure's heading and hint (`sandboxError`,
  `sandboxErrorHint`). The sandbox's own error text between them stays untranslated on
  purpose — that is the tool's output, not the library's copy.

  **`tag` — a BCP-47 language tag, because a clock is not a string.**

  The only `Intl` call in the library passed `undefined` as its locale:

  ```ts
  date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  ```

  `undefined` means _follow the browser_. So `setLocale(fr)` moved fifty strings and left
  the timestamp above every message reading `7:32 PM`, because the browser had never been
  asked. French is 24-hour.

  A tag and **not** an `hour12` flag: a flag answers one question at one call site, a tag
  answers every question `Intl` can be asked — hour cycle, date order, month names,
  decimal separator, relative time, list joining — for every locale, including the ones
  nobody here can enumerate. `direction` next door is the precedent: the locale's metadata
  section already holds how a language _behaves_, not what its words are.

  The English default declares **no** tag, deliberately: `undefined` keeps following the
  browser, which is the right default for a library and the behaviour every consumer has
  today. `@aparte/locale-fr` declares `tag: "fr-FR"` — if you have chosen French strings,
  French formatting is what you meant. A timestamp also re-renders on a config change, or
  the language would switch around a 12-hour time that stayed put.

  `@aparte/locale-fr` now covers every key core declares: 25 required, 25 optional, none
  missing.
  <sub>`@aparte/core`, `@aparte/locale-fr`</sub>

- [3f182ef](https://github.com/apartejs/aparte/commit/3f182ef): **Eight strings that could not be translated in any language now can.** Additive: five
  new optional locale keys, and one required key that already existed and was read by
  nothing.

  Switching the locale left these in English, in every language, forever — no reload
  helped, because they were literals in the markup rather than lookups:

  | where                                 | was                                   | key                               |
  | ------------------------------------- | ------------------------------------- | --------------------------------- |
  | error segment heading                 | `Error`                               | `error` — **already existed**     |
  | artifact card download button         | `Download` (title + aria-label)       | `download`                        |
  | binary artifact download buttons (x2) | `Download`                            | `download`                        |
  | artifact card tabs                    | `Preview` / `Code`                    | `preview`, `code`                 |
  | binary artifact status                | `Generating…` / `Rebuilding preview…` | `generating`, `rebuildingPreview` |
  | `pipeline-waiting` accessible name    | `Generating…`                         | `generating`                      |

  The error heading is the one worth pausing on. `locale.error` is a **required** key,
  documented under Status Indicators, defaulting to `"Error"`, and `@aparte/locale-fr` has
  shipped `"Erreur"` for it since it existed — while nothing in the library read it and the
  card next to it hardcoded `Error`. A translated string with no consumer and a literal
  with no translation, in the same component.

  Four of the eight are an `aria-label` or a `title` with no visible text, which is why they
  survived: nothing on screen was in the wrong language, so only a screen-reader user or
  someone hovering would ever have met them. `pipeline-waiting` is the extreme case — three
  CSS dots and an accessible name, so that name is the segment's entire content as far as a
  screen reader is concerned, and it announced English in every locale.

  All of them also update **live**, through the `relabel` hook: `setLocale()` on a rendered
  transcript now moves them without rebuilding the segments, so a mounted preview keeps
  running and an expanded reasoning block stays expanded. The artifact card's tabs are
  relabelled by text only — `aria-selected` and `data-tab` are the reader's state, not the
  locale's, and a relabel that touched them would close a preview somebody had opened.

  Also fixed in passing, because it was the same defect one line up: the artifact card's
  copy button put `t('copy')` in its `title` and the literal `"Copy"` in its `aria-label`,
  so a French reader got a French tooltip and an English announcement.

  Knowingly left: `aria-label="Streaming"` on the card's pulse indicator. It sits on a
  `<span>` with no role, where an accessible name is not reliably announced at all, so a
  key for it would translate something nothing reads. It needs a role before it needs a
  translation.

  Found by sweeping for the pattern rather than trusting the list: the count went from
  four to six while writing the keys, and to eight when a regex over every `title=`,
  `aria-label=` and `>Word<` in core found two more `Download` buttons on the binary
  artifact path — a second renderer with its own buttons, which no reading of the first
  one would have surfaced.
  <sub>`@aparte/core`, `@aparte/locale-fr`</sub>

- [494e3dd](https://github.com/apartejs/aparte/commit/494e3dd): **Removed: the `file-tree` segment type.** Breaking, deliberately and without a shim.

  `{ type: 'file-tree' }`, `AparteFileTreeSegment` and `AparteFileNode` are gone, with
  their renderer, their styles and their fourteen `--aparte-file-tree-*` /
  `--aparte-file-status-*` variables. Core ships nine segment kinds now, not ten.

  It was in the wrong place, and every symptom of that was visible before anyone
  noticed the cause:

  - **No model emits a file tree.** The segment kinds core owns are what a model
    produces — prose, reasoning, a fenced block, a tool call, an artifact — plus what
    its own loop reports. A directory listing is neither: it is an app rendering the
    result of a tool it ran.
  - **Nothing in the library produced one.** No parser, no client, no example, no
    browser test. A consumer had to hand-build the whole tree.
  - **And it had drifted accordingly**: no locale keys and no icon-provider calls
    anywhere in it — its glyphs were literal emoji — so it was the one renderer a
    language change or an icon pack could never touch. That is what an unattended
    surface looks like.

  **What to do instead.** A file list is the result of a tool, so it belongs to that
  tool: register a renderer for it with `config.registerToolRenderer(name, renderer)`
  and it draws inside the `tool_call` segment, which is where the model's request and
  the result already live. `@aparte/plugin-ask-user` is that shape end to end if you
  want a worked example. If you genuinely need a standalone block with no tool behind
  it, `registerSegmentRenderer` still takes a type of your own — that path is
  unchanged, and it is the one this type should have used from the start.

  Nothing else in core referenced it, so there is no migration beyond deleting your own
  `file-tree` segments or moving them behind one of those two seams.
  <sub>`@aparte/core`</sub>

- [0fed195](https://github.com/apartejs/aparte/commit/0fed195): **Removed: the `terminal` segment type, with its event and its host handler.** Breaking, pre-1.0, no shim.

  Gone from core: `{ type: 'terminal' }`, `AparteTerminalSegment`, the renderer, 117
  lines of CSS and 11 `--aparte-terminal-*` variables, the `aparte-terminal-run` event
  and its `AparteTerminalRunEventDetail`, and the `terminalRun` host handler. The four
  wrappers stop re-exporting the two types. Core ships eight segment kinds now.

  **No protocol has a "terminal".** When ChatGPT shows one, that is a **tool call**: the
  model emits a call whose arguments are code, and the client renders the _result_ in a
  monospace pane. Same in a console agent — `bash` is a tool, the app runs it, the app
  prints the output. The name in the wire format is the tool's (`code_interpreter`,
  `bash`, `run_command`); "terminal" is a UI convention, not a kind of content.

  The evidence was in the type all along. `exitCode` and `isRunning` are not things any
  protocol provides — a tool result is a string. Those two fields are the signature of a
  component written for an app that owned the execution, not for a library rendering a
  protocol. Consistent with that: nothing in the library ever emitted one — no parser,
  no client, no example, no browser test.

  **What to do instead.** Register a renderer for your own tool and it draws inside the
  `tool_call` segment, where the request and the result already live:

  ```ts
  config.registerToolRenderer("bash", myConsoleRenderer); // or 'run_command', 'python'
  ```

  That is the seam this belonged in, and it puts the naming where it belongs: core cannot
  know what your tool is called, and baking one vendor's tool name into a
  framework-agnostic library would be wire-format knowledge in the wrong layer.
  `@aparte/plugin-ask-user` is the same shape end to end if you want a worked example.
  If you need a standalone console block with no tool behind it,
  `registerSegmentRenderer` still takes a type of your own — that path is unchanged.

  The `terminal` **icon key** stays in the icon provider: a consumer writing their own
  console renderer will want `getIcon('terminal')`, and an icon name costs nothing.

  Migration: delete your `terminal` segments, or move them behind
  `registerToolRenderer` / `registerSegmentRenderer`. If you declared
  `setHostHandlers({ terminalRun: true })`, drop that key — the others are unchanged.
  <sub>`@aparte/core`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [155a619](https://github.com/apartejs/aparte/commit/155a619): **Removed: the `diff`, `image` and `preview` segment types.** Breaking, pre-1.0, no shim.

  `AparteDiffSegment` (with `AparteDiffHunk` and `AparteDiffLine`),
  `AparteImageSegment` and `ApartePreviewSegment` are gone, and the three members leave
  the `AparteSegment` union. Core ships eight segment kinds.

  All three were **declared and unrenderable**. They had complete data shapes, they were
  members of the public union, and no renderer existed for any of them — so
  `{ type: 'diff', hunks: [...] }` typechecked and then rendered
  `[Unknown segment type: diff]` with a console warning. TypeScript accepted what the
  screen refused; now both refuse.

  Two of them were duplicating paths that already work better:

  - an **image** is `![alt](url)` in the reply's markdown, which the markdown plugin
    renders — including the sanitising and the streaming-safe href checks;
  - a **preview** is what the `artifact` segment does, inside a sandboxed iframe with a
    double-delivered CSP, mounted only on an explicit human press.

  The third, **diff**, is a different case and got the same verdict for the reason the
  `terminal` removal established: a patch is the _result of a tool_ the model called, not
  something the model emits. It belongs to that tool's renderer
  (`config.registerToolRenderer`), where the request and the result already live —
  or to a segment type of your own via `registerSegmentRenderer`, which is unchanged.

  None of the five types was reachable from `@aparte/core`: they lived in the internal
  types barrel and were never in the root export. So no import breaks. What changes is
  that the union no longer promises three kinds nothing could display.
  <sub>`@aparte/core`</sub>

- [88cc99a](https://github.com/apartejs/aparte/commit/88cc99a): **New: `relabel` on `AparteSegmentRenderer` — a config change now reaches the text inside a rendered segment.**

  A language switch or a new icon set left every segment already on screen in the old
  language: a code block's copy tooltip, a terminal's Run label, a reasoning block's
  "Reasoning", and — worst — the Approve and Reject buttons on a tool call waiting for a
  human decision.

  `relabel?(element, segment)` is called on a config change for every segment on screen,
  bound by the same rule `update()` already carries: **attributes and text only, no
  child node added or removed**. Implemented in the six built-ins that hold
  config-derived text — `thinking`, `code`, `terminal`, `tool_call`, `error`,
  `artifact/card`. `text`, `file-tree`, `progress` and `pipeline-waiting` do not
  implement it, exactly as they do not implement `update()`: their chrome is their own
  data.

  **Why not simply re-render the segments.** That was the first plan, and an audit
  rejected it. `_renderSegments()` wipes the container and rebuilds, which destroys
  state the DOM owns and the segment data does not:

  - a mounted sandboxed artifact preview, executing model-authored code, is torn down
    with no warning and the card falls back to its Code tab;
  - a reasoning block the reader expanded by clicking `<summary>` snaps shut, because
    nothing writes that back to `segment.collapsed`;
  - scroll position inside a long terminal or reasoning pane resets to the top;
  - the focus on an Approve/Reject gate is dropped to `<body>` — for a keyboard or
    screen-reader user, mid-decision;
  - a segment still streaming loses the incremental Markdown parser's buffered
    lookahead and restarts from the first byte;
  - and the container-wide childList mutation is what the `update()` contract exists to
    avoid, because the viewport's observer reads it as "scroll to the bottom".

  It would also have been an incomplete fix. Several strings were never routed through
  `t()` at all — the error card's "Error" heading, the artifact card's `aria-label` and
  its "Preview" / "Code" tabs, the download button, `progress`'s fallback label and
  `pipeline-waiting`'s `aria-label`. A full re-render leaves every one of them in
  English. Giving them locale keys is an additive change of its own; a test in this
  change pins the "Error" heading so that change has something to break.

  Nine tests, both halves seen to fail: disabling the loop reddens six of nine (the
  three survivors assert absences), and making one `relabel` rebuild its node instead of
  patching it reddens exactly the identity and label cases. One test opens a reasoning
  block by hand and asserts a config change leaves it open.

  One small behaviour change came with it: a code block's copy button marks itself while
  its "copied" confirmation is showing, so a config change arriving inside that 1.5s does
  not cancel what the reader is looking at.

  Still to do, each for a reason: `aparte-elicitation` needs its pending state to keep a
  reference to the panel, and the model-selector plugin needs to be additive to its own
  `aparteConfigChanged` hook without re-running its population path.
  <sub>`@aparte/core`</sub>

- [9ac83d4](https://github.com/apartejs/aparte/commit/9ac83d4): **A segment's measurements move from its own fields into `meta.aparte`.** Breaking,
  pre-1.0, no shim. `startedAt` and `endedAt` are gone from `AparteSegmentBase`.

  Why, and it was checked rather than assumed: **no protocol carries a timestamp on a
  content block.** Anthropic's blocks have none and neither does the message; OpenAI's
  `output_text` part is `{annotations, logprobs, text, type}` with `created_at` on the item
  above it; the AI SDK's `UIMessage.parts` have none either. What the AI SDK _does_ have is
  a metadata bag whose canonical example is literally `{ createdAt, model, totalTokens }` —
  at the message level. A per-block **id** has industry precedent; per-block **time** has
  none anywhere.

  So a span is a local measurement, and the shape now says so:

  ```ts
  segment.meta?.aparte?.startedAt; // was segment.startedAt
  segment.meta?.aparte?.endedAt; // was segment.endedAt
  ```

  Still **typed** — `AparteSegmentTiming`, exported. The bag is where it belongs; opacity
  was never part of the deal. Namespaced under `aparte` because the rest of `meta` is
  yours: a flat `startedAt` there would collide with a key of your own.

  **Read it through the helpers and this change costs you nothing.** `segmentDuration()`
  and `isSegmentSettled()` keep their signatures, and `segmentTiming(segment)` is new for
  the two numbers themselves. All three are exported, and all three are the rules core uses
  rather than a copy of them — the vanilla example needed no code change at all.

  **The one thing to know if you write `meta` yourself:** `updateSegment(id, { meta })` now
  **merges** instead of replacing. That is not a convenience, it is the whole risk of
  putting two writers in one bag — a plain spread from either side would erase the other,
  and your first `{ meta: { cost } }` would have silently deleted core's measurement. One
  helper does the merge and all three update sites go through it.

  Also: a `setSegmentDefaults()` default may fill `meta` but **not `meta.aparte`** — those
  fields stopped being reserved as fields and became reserved as a sub-object, or a default
  could hand an app a span it never measured.

  **Migration.** Replace `segment.startedAt` / `segment.endedAt` with
  `segmentTiming(segment)?.startedAt` / `?.endedAt`, or better, with `segmentDuration()`.
  If you persist segments, your stored `startedAt`/`endedAt` are no longer read: move them
  under `meta.aparte` when you load.
  <sub>`@aparte/core`</sub>

- [7602c8d](https://github.com/apartejs/aparte/commit/7602c8d): **A reasoning block is closed by default, and any segment type can be given defaults.**
  Breaking for anyone relying on reasoning blocks rendering open, pre-1.0, no shim.

  `collapsed` absent used to mean **open**, and core's own stream parser emitted
  `collapsed: false` on every thinking segment it produced — so a reasoning block stayed
  unfolded for the whole conversation, with the answer buried under it. No assistant on
  the market does that: the content sits behind a click, streaming or settled.

  Now `collapsed === false` opens a block and anything else closes it. The parser stops
  saying it at all. `collapsed: false` is still how you open one on purpose; only _absent_
  changed meaning. The old default was pinned by no test, which is how the parser came to
  contradict it unnoticed — it is pinned now.

  **`setSegmentDefaults(type, defaults)`** is the way to change it for a whole app:

  ```ts
  aparteGlobalConfig.setSegmentDefaults("thinking", { collapsed: false });
  aparteGlobalConfig.setSegmentDefaults("my-chart", { theme: "dark" });
  ```

  It exists because a per-segment field is unreachable for the case that matters: when a
  reply streams, the consumer does not construct its segments — the parser does — so there
  was nothing to set `collapsed` on. And it is keyed by **type**, not one function per
  field: a `setThinkingOpen()` would need a sibling the next time any type wanted a
  default, and the type key is a string, so a consumer's own type is covered by the same
  call.

  Applied where a segment's identity is stamped, which is what makes it cover every
  arrival path — `addSegment`, the segments seeded on an `appendMessage`, the framework
  host, and the parser's output — with no renderer having to look anything up. Rules:

  - a field the producer set always wins, **including an explicit `undefined`** (that is a
    statement, not a gap — the merge asks `key in segment`, not `?? `);
  - identity is refused: `id`, `type`, `messageId`, `index`, `startedAt`, `endedAt`. A
    default `id` would hand every segment in a conversation the same one;
  - read at insertion and baked in. Changing a default later does not reach segments
    already on screen: a block the reader opened has state the data does not;
  - per instance — each chat resolves its own config, so two chats on one page can default
    differently;
  - cleared by `reset()`, like every other piece of config.

  Also new: `getSegmentDefaults(type)`, `clearSegmentDefaults(type)`, and the
  `AparteSegmentDefaults` type.

  **Migration.** If your app wants the old behaviour, one line:
  `aparteGlobalConfig.setSegmentDefaults('thinking', { collapsed: false })`.
  <sub>`@aparte/core`</sub>

### Patch Changes

- [f1fcbb4](https://github.com/apartejs/aparte/commit/f1fcbb4): **The artifact card's tab row and its heights.** Three things, all reported from the
  landing.

  **Code comes first, and the pair sits with the other controls.** The card opens on Code —
  mounting the preview would execute model-authored code with no gesture — and a selected
  tab sitting _second_ reads backwards. DOM order is also keyboard order, so the tab a
  reader reaches first is now the one already showing. The pair is right-aligned, under the
  header's copy/download buttons, so every control is in one column.

  **The tab row declares its own layout.** Core is light DOM on purpose: no shadow root, no
  `::part()`, any selector reaches in — and the corollary is that a component must state
  what its layout depends on, because an undeclared property has nothing to override a
  host's rule with. A page with a bare `nav { justify-content: space-between; padding-top:
30px }` was pushing the card's `<nav>` tabs to opposite ends and padding the row out.
  `justify-content` and the padding are declared now.

  **Six hardcoded heights become variables**, each with its default in its read
  (`var(--x, 480px)`), the way every other value in that file already works:

  |                                      | default |
  | ------------------------------------ | ------- |
  | `--aparte-artifact-frame-height`     | `480px` |
  | `--aparte-artifact-frame-max`        | `70vh`  |
  | `--aparte-artifact-body-max`         | `600px` |
  | `--aparte-artifact-pending-height`   | `120px` |
  | `--aparte-artifact-file-code-max`    | `360px` |
  | `--aparte-artifact-file-preview-max` | `460px` |

  The preview frame stays a **fixed** height rather than an aspect ratio, which is what
  embeds of arbitrary HTML actually do — CodeSandbox documents `500px`, StackBlitz takes a
  height parameter — because a frame with an opaque origin cannot be measured, and a 16/10
  ratio on a wide card is enormous. What was missing is the `70vh` cap: a fixed 480px should
  not own a phone screen.

  Two incoherences went with it: the code pane repeated the body's `600px` (two owners of
  one number), and the "press Preview" placeholder was `120px` tall inside a body whose
  `min-height` said `80px`, so that minimum applied to nothing.
  <sub>`@aparte/core`</sub>

- [388b594](https://github.com/apartejs/aparte/commit/388b594): **Fix: any config change made avatars appear across the transcript, and switching back did not remove them.**

  The default bubble shell renders `<div class="aparte-avatar">` empty, and the
  stylesheet hides it while it stays that way — `.aparte-avatar:empty { display: none }`,
  with the comment "No message avatar by default — the slot only shows once an
  AvatarProvider (or a consumer) fills it."

  `_updateName()` wrote a one-letter initial into that slot unconditionally, and
  `_onConfigChange` calls `_updateName()` so that already-rendered bubbles pick up a
  live change. Every notifying setter therefore filled it: `setLocale` — a language
  switcher is enough — `setBubbleActions`, `setIconProvider`. Avatars appeared on a
  click that had nothing to do with them, on messages already on screen, and undoing
  the click changed nothing because the text was by then written. `_updateRole()` did
  the same on a role change.

  Both now refresh an initial that is **already there** and never create one. The guard
  is "already non-empty" rather than "no avatar provider" on purpose: `avatarInitial` is
  part of the `AparteBubbleShellRenderer` contract, so a custom shell may render an
  initial and must still see it kept in sync when the name changes. Empty stays empty;
  filled stays in sync.

  `_renderAvatar`'s documentation claimed it "falls back to the default initial / image
  rendered by `_render()`" when no provider is set. There is no such initial — the
  default shell renders the slot empty — and believing there was is what made the two
  update paths write one. Corrected.

  Five tests, both guards seen to fail: reverting the `_updateName` guard reddens the
  config-change and name-change cases, reverting the `_updateRole` one reddens the
  role-change case. One of them asserts the custom-shell contract still holds, which is
  what rules out the narrower fix.
  <sub>`@aparte/core`</sub>

- [79956cb](https://github.com/apartejs/aparte/commit/79956cb): **A bubble with nothing to paint no longer paints a box.** Reported from the page: send
  a file with no text, and the message showed an empty coloured rectangle under the chips.

  `.aparte-message-content` carries the user bubble's background, padding and radius, and
  the attachment chips render **above** it, outside it. So a message that is only
  attachments left that box with no content, no segments and no waiting dots — and it drew
  itself anyway.

  It is hidden now when it is empty **and not waiting**, which is the whole rule: the
  assistant's typing dots live inside that same box, and a fresh streaming bubble is empty
  by definition. Hiding on emptiness alone would have taken the typing indicator with it —
  asserted, not assumed.
  <sub>`@aparte/core`</sub>

- [9642713](https://github.com/apartejs/aparte/commit/9642713): **A syntax highlighter's dual-theme output is no longer thrown away.** The default
  sanitizer's inline-style allowlist had entries for `color`, `background-color` and the
  font properties, and none for a custom property — so shiki's documented light-and-dark
  mode, `defaultColor: false`, which emits **only** `--shiki-light` / `--shiki-dark` and
  leaves the choosing to CSS, lost every declaration and rendered every code block white.
  The feature was unreachable, not merely unstyled.

  A custom property is now kept, with two rules:

  - **The value scrubbing is unchanged.** A custom property is inert until some CSS reads
    it, so the value is what has to be safe: `url()`, `expression()`, `javascript:`, a CSS
    identifier escape and `<>` are refused exactly as before.
  - **Our own namespace is refused.** `--aparte-*` is dropped. Core's entire theme is
    custom properties, so a model-authored block setting `--aparte-primary` would repaint
    the chat around itself — not highlighting, defacement with our own paint.

  If you were working around this by pinning a single shiki theme, you can stop.
  <sub>`@aparte/core`</sub>

- [fbffb48](https://github.com/apartejs/aparte/commit/fbffb48): **Fix: a message appended with its segments already populated wrote every streamed chunk twice, and its segments were never stamped.**

  `appendMessage({ …, segments: [...] })` is a real path — a conversation restored from
  storage, a prefix an app injects, `setMessages()` — and it went around two earlier
  fixes.

  **The doubling.** Streaming into such a segment produced
  `"ThatThat  deletesdeletes  aa  filefile"`, in the message model and on screen.
  `populateBubbleFromMessage` handed the repository's own `segments` array to
  `bubble.setSegments()`, which stored it **by reference** while `getSegments()` had
  always copied on the way out. One array, two writers: the viewport replaced the slot
  with `{...segment, content: old + chunk}`, then the bubble looked the segment up in
  what it believed was its own list, found that replacement — chunk already in it — and
  appended the chunk again.

  This is the same failure as the `appendToSegment` fix in 0.4.0, which resolved it for
  `addSegment` (where it cannot happen: the bubble pushes into a list it created itself,
  so the viewport's replacement decouples the two immediately). Its regression tests all
  drive `addSegment`, so this path stayed broken for exactly the reason that changelog
  entry gave for why nothing had caught it the first time — the tests went around it.
  `setSegments` now copies the array in, which covers every path through
  `populateBubbleFromMessage` from its single production caller.

  **The missing stamps.** `messageId`, `index` and `startedAt` — shipped in 0.9.0 — were
  written only by `addSegment`, so a segment arriving with its message had none of them.
  The same field was present on one path and absent on the other, silently, and anything
  reading them had to cope with both. Seeded segments now go through the same
  `stampSegmentOnInsert` seam, accumulated into a new array so `index` follows position
  and the caller's array is no longer retained. Values already present are never
  overwritten, so a conversation reloaded from storage keeps the numbers it stored.

  The bubble is also handed the stamped copy rather than the caller's object: it was
  rendering segments with no `index` or `startedAt` while the model held stamped ones.

  Six regression tests, each seen to fail: reverting the copy reddens the exact-text and
  `setMessages` cases, and reverting the stamping reddens the identity, position and
  object-sharing cases.

  **Known and not changed here:** `AparteChatHost` (the framework-managed owner) stamps
  on `addSegment` but not on segments that arrive with a message, because that array
  belongs to the framework's own state — copying and stamping it is a decision about
  ownership, not a bug fix, and it deserves its own change.
  <sub>`@aparte/core`</sub>

- [fc8a83b](https://github.com/apartejs/aparte/commit/fc8a83b): **Fix: the stop button's accessible name was never translatable, in any language.**

  `aparte-composer-cancel` has read `t('stopButton')` since it existed, and
  `stopButton` was declared nowhere — not in `AparteLocale`, not in
  `APARTE_DEFAULT_LOCALE`, not in `@aparte/locale-fr`. So `t()` returned nothing and
  the `|| 'Stop'` fallback rendered every time, in every locale, including after a
  full reload. The key is declared now, with its English default, and translated in
  `@aparte/locale-fr`.

  This is the second instance of a defect `locale.ts` already records for
  `submitButton` one entry up: _"A key read and never declared is worse than a
  literal: it looks translated."_ It was found by auditing something else entirely.

  Why it survived: the button carries **no visible text**. The string is its
  `aria-label` and its `title`, so nothing on screen was ever in the wrong language —
  only a screen-reader user, or someone hovering, would have met it. Most of the
  composer's translatable surface is like this, which is worth knowing before trusting
  that the rest of it works.

  The key is optional, like the other fifteen, so no consumer locale becomes invalid:
  a locale without it keeps the English default.

  Nothing about the landing page changed except that it now _counts_ the keys in
  `AparteLocale` at build time instead of saying "forty" — adding one key made five
  hand-written "forty"s wrong in the same commit that added it.
  <sub>`@aparte/core`, `@aparte/locale-fr`</sub>

- [4ce2ae6](https://github.com/apartejs/aparte/commit/4ce2ae6): **A code block is coloured while it streams, not after it.** Reported from the screen: an
  artifact's code pane flickered between plain white and syntax colours on a dark theme.

  The debounce was innocent. Every token ran `codeEl.textContent = content`, which destroys
  the highlighter's `<span>`s — so a token erased whatever the last debounce had painted.
  Plain most of the time, one coloured frame every 400ms. The `code` **segment** had the
  mirror-image bug: no colour at all until stream-end, behind a comment explaining that a
  per-token highlight would be too expensive.

  Both are the same missing idea. The pane is now split at the last newline: the prefix of
  **complete lines** is highlighted, and the line still being written stays plain in a tail
  span that a token can rewrite on its own. Not colouring that last line is deliberate
  twice over — it is what makes a token cost one text assignment, and an unterminated string
  or brace re-tokenises everything after it, which was the other half of what looked like
  flicker.

  `streamHighlight` replaces the artifact family's `debounceHighlight` and serves all three
  panes (card, binary file, `code` segment). The boundary lives in the DOM rather than a
  module map, which is what makes a slow earlier highlight unable to rewind the pane.

  **And the artifact's pulse stops when the stream does.** `render()` painted the streaming
  indicator and nothing ever removed it, so a finished document went on claiming to be in
  flight — every 1.2s, forever. It survived this long because nothing in the repo streamed
  an artifact: the card had only ever been handed settled content, so its streaming
  affordances had never once been exercised.
  <sub>`@aparte/core`</sub>

- [17d31fb](https://github.com/apartejs/aparte/commit/17d31fb): **An SVG artifact with only a `viewBox` now previews.** It showed a blank frame.

  The preview document centres its content with `display:flex; align-items:center`, and an
  SVG that carries only a `viewBox` — the recommended, responsive form, and the one a model
  writes most often — has no intrinsic dimensions. As a flex item its cross size then
  collapses to zero and the frame is empty. So the preview worked for the less idiomatic
  SVG, the one that states its own `width`/`height`, and silently showed nothing for the
  normal one.

  Fixed with `svg:not([width]):not([height]){width:90%;height:90%}` — narrowed by attribute
  selector so an SVG that asks for a size keeps it. A blanket `width:90%` was the shorter
  fix and would have stretched every sized SVG instead.

  The preview document had no tests. It has four now, including one that pins something
  deliberate: it does **not** run the message sanitizer, because that drops `<svg>`
  wholesale (correctly, for content rendered in the page) and would make every SVG artifact
  unpreviewable. The CSP and the sandboxed frame are what make it safe.
  <sub>`@aparte/core`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`.</sub>

## 0.9.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [216c5f0](https://github.com/apartejs/aparte/commit/216c5f0): **A segment now knows where it sits and when it happened.** `AparteSegmentBase`
  gains five optional fields — `messageId`, `index`, `startedAt`, `endedAt`, `meta` —
  so a consumer can build the chrome the market has taught users to expect (a
  collapsed reasoning line with its duration, a tool pill with how long the call
  took) without replacing a renderer. All optional, so nothing existing changes
  shape.

  **Core renders none of it.** It measures the span, because it owns the stream, and
  leaves the display to you: the line reads "Thought for 8s" in one product and
  "8.2s · 1.2k tokens" in another. `meta` is your channel — core never writes there;
  fill it with the `updateSegment(id, { meta })` that already exists. The
  customization guide carries the runnable recipe, and the vanilla example runs it.

  Stamped in one place (`utils/segments.ts`), called by the two owners of a message's
  segment array — the viewport and the framework host. Not by the parser: `tool_call`
  and `pipeline-waiting` segments never pass through it, and its per-turn counter
  would have restarted mid-message on a tool round-trip. `pnpm check:segment-stamp`
  keeps a third writer from appearing.

  `endedAt` is **when content last arrived** — it advances while a segment streams and
  freezes when it settles, so the difference is a live duration during a turn and a
  final one after it. The two simpler rules are both wrong and were both measured:
  closing at the end of the turn makes a reasoning block span the answer that
  followed it (2s of thinking before a 20s reply reads "22s"), and closing when the
  next segment opens counts a ten-second gap as thinking. Only payload counts —
  collapsing a block is presentation, not activity.

  **A segment is now marked finished when the stream says so, not when the turn ends.**
  The parser knew the exact end of every delimited segment — the closing token IS the
  end — and dropped it, so the only signal left downstream was the end of the turn: a
  reader watched "Thinking" for as long as the answer took to stream, and the Markdown
  flush and the highlight-on-settle waited just as long. The parser now marks what it
  closes, at all six sites, and both loops forward that mark instead of content alone.
  Reasoning arriving on its own `reasoning_content` channel has no delimiter, so its
  end in band is the first answer token — both loops say so there too. A duration line
  is therefore readable _while_ the answer streams, which is the whole point of having
  one.

  All five are optional, because they describe a lifecycle rather than a shape: a
  segment built by hand or freshly emitted by the parser has not been inserted yet and
  has no start, and an open segment has no end. `segmentDuration(segment)` reads the
  span so a consumer never subtracts the two fields — the hand-written guard is three
  conditions long and wrong at epoch 0, where a valid timestamp is falsy.

  `isSegmentSettled` is exported alongside them: a tool call settles by its `status`,
  never by `isStreaming`, so a hand-rolled check measures nothing on the segment type
  where a duration matters most.

  Three defects the feature exposed, each fixed:

  - **Nothing ever declared a segment finished.** `completeMessage()` had no callers,
    and the path both agent loops actually take — `updateMessage({ status })` — never
    touched segments. So `isStreaming` was never set to false for a thinking, text or
    code segment anywhere in the model. Both owners now close a finished turn's
    segments through `updateSegment`, which stamps the model _and_ repaints the
    bubble; `error` and `aborted` count as finished, because a stopped stream still
    produced what it produced.
  - **`registerDefaultRenderers()` overwrote a renderer the app had registered**,
    while the lazy `installDefaultRenderersOnce()` documented itself as never
    replacing one. Since `new AparteClient()` calls the eager path, registering a
    custom renderer _before_ constructing your client — the order anyone writes — put
    the built-in silently back. Both paths are now additive.
  - **A code block's copy button copied an empty string** once one more update
    arrived in the turn: it read the segment captured when `setup` ran, and the bubble
    replaces that object on every update. It now reads the rendered source.

  `aparte-terminal-run` gains `messageId`, and its `segmentId` is no longer nullable —
  both come off the segment instead of a DOM attribute, so the event is finally
  resolvable to a turn.
  <sub>`@aparte/core`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.8.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [c33d2b0](https://github.com/apartejs/aparte/commit/c33d2b0): A fourth cold audit: two CRITICALs, fourteen MAJORs, and the guards that let four of them in

  Same protocol as the third — five auditors, no changelog, no git history. It found less
  on the surface and more underneath, which is the only progress worth reporting: the two
  CRITICALs were both in code less than two days old, and four of the MAJORs were defects
  in the guards rather than in the library.

  **The two CRITICALs share a root: `{ config }` scoped what a chat READ and not what it
  ANSWERED.** `AparteClient` listens on `window`, and its only instance filter was
  `scopeToTargetId`; unset, the guard returned `true` for everything. Two config-scoped
  clients on one page therefore both ran a full agentic turn for every send — two provider
  calls, two paid completions, both replies appended into the single target the event
  named. A config-scoped client now declines a target whose boundary resolves a different,
  non-global config; a client on the global config still answers everything, which is every
  single-chat app. The second: opening a conversation revoked its own attachments' object
  URLs, because `clearAll()` releases them and both `setMessages` and `importTree` put the
  messages straight back — and `export()` stores live references, so the two views share the
  very same attachment objects. Every image and file chip was dead on load.

  **Three MAJORs in the turn.** A mid-stream `error` event erased everything already
  rendered: `_handleLifecycleError` replaced the segments instead of appending, so a partial
  answer plus an error became an empty bubble with an error in it. `toolTimeoutMs` could not
  time anything out — all three copies aborted a signal and then awaited the handler with no
  race, and aborting is a request a handler may ignore, which the default shape of a
  consumer tool does. Core's two copies now share `withToolTimeout`. And the engine
  compactor could emit a window opening on `role: 'tool'`, which every OpenAI-compatible
  provider rejects with a 400: compaction turned a long conversation into an unusable one.

  **Consent is scoped to the chat that asked.** Human-in-the-loop approval matched on the
  model-chosen `toolCallId` and nothing else, on a `document` listener, with built-in buttons
  that bubble and compose — so on a page with two chats, a click aimed at one tool could
  satisfy the gate awaiting a different tool in a different conversation. The check is now
  DOM containment: a model can choose an id, it cannot choose where a click happened. A
  programmatic dispatch from a host is still honoured.

  **Three more surfaces where per-instance config did not reach what it configures.**
  `injectRendererStyles()` collected the global's styles over an instance config's, so a
  renderer registered on a config drew unstyled and silently; it now takes the config and
  accumulates rather than assigns, and re-creates its `<style>` when the old one has been
  detached rather than only when it is null. `setupMarkedProvider(options)` scoped the
  provider and not the options — `marked.use()` mutates a module singleton cumulatively, so
  configuring the second chat retroactively changed the first's rendering. And the global
  type augmentations reached the browser entry only, so an SSR consumer silently lost typed
  `e.detail` on every aparté event.

  **Every `AparteChat` accepts a caller-supplied host id.** `scopeToTargetId` matches
  `detail.targetId`, which the wrappers set from an id they generated and neither accepted
  nor exposed — so the documented mechanism was unreachable from three of the four
  components. React, Vue and Svelte gain an optional `id` prop; Angular already honoured
  one. The generated id remains the default.

  **The artifact preview stops overclaiming.** Its comment said everything leaving the frame
  is blocked. The fetch half is true and measured in three engines; the frame navigating
  ITSELF is not a fetch and no directive governs it — `navigate-to` was removed from the
  spec and never shipped. No CSP or sandbox token stops it, so the fix is the claim, plus a
  danger block on `setArtifactPreviewBuilder`, which was one line that never mentioned it
  replaces the policy while recommending CDN libraries.

  **Four MAJORs were the guards.** `check-doc-snippets` compiled with a WEAKER profile than
  the repo compiles itself with — no `noUncheckedIndexedAccess`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch` or `noImplicitOverride` — so a snippet could be certified
  while a reader's build, following this project's own recommended settings, rejected it.
  Aligned, it immediately failed the flagship getting-started example.
  `check-export-mentions` could not read a barrel written as `export *`, saw 4 names for the
  engine's 39-name surface, and then certified the package already at zero unmentioned; it
  also credited a short export whenever a longer documented name merely contained it, and
  its list of barrels omitted the plugins, providers and locale-fr. `check-node-barrel-types`
  diffed export names, which an augmentation module has none of. `check-wrapper-slots` proved
  nothing about the host id. All four now bite, verified by sabotage one at a time, and the
  export guard gained the SEEN floor that a collapsed count needs — the third guard in this
  repo to need it for the same reason.

  **The wrapper reference has examples.** Eleven of the sixteen slot × framework
  combinations appeared in no code block anywhere, in a page whose own history is the reason
  this project has a rule about capabilities cited in passing. The page is generated, so each
  slot now emits one fence per framework from the same table as the syntax column.
  <sub>`@aparte/core`, `@aparte/engine`, `@aparte/plugin-marked`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [688a231](https://github.com/apartejs/aparte/commit/688a231): Remediation of a from-scratch audit: four CRITICAL and nineteen MAJOR defects, plus the
  guards that make each class unrepeatable.

  **Fixes you will notice**

  - **Pressing Stop no longer erases the answer.** A stopped turn replaced everything
    already streamed with an error bubble, and never dispatched `aparte-message-aborted`.
    Three separate paths had to be closed: an abort arriving while the loop was parked on
    its read, `openai-compat` reporting an `AbortError` as a stream error where `ai-sdk`
    stays quiet, and a rejection escaping `transportCall` before the first event.
  - **A code fence split across deltas no longer eats the text before it**, and no longer
    leaks a literal ` ```python ` into the message.
  - **A split `<artifact` tag no longer loses its whole lifecycle.** `<` and `artifact` are
    separate tokens in most vocabularies, so whether artifact events fired depended on
    where the tokenizer cut.
  - **A turn the human stopped, stops.** A rejected tool no longer lets the rest of that
    turn's tool calls run.
  - **`compact()` only touches its own chat.** With two clients on a page, one event made
    both summarise the same conversation and wiped the other with no summary.
  - Retrying the first message no longer resends the whole conversation. Viewport listeners
    no longer accumulate when the element is moved in the DOM. A stream we walk away from
    is cancelled rather than left generating.

  **Breaking**

  - **A previewable artifact no longer runs the model's code without a user gesture.** The
    card opened on Preview with the frame already mounted, so every render of a completed
    artifact — including reloading a persisted conversation — executed model-authored JS.
    It is sandboxed, so this was a prompt-injection surface rather than origin XSS. The
    frame is now created only when the user presses Preview, and is CSP-constrained. An app
    that wants it open must open the tab itself.
  - **`authorize` is required on `createAparteChatHandler`.** The endpoint spends your
    server-held key, and both the JSDoc example and the docs snippet omitted it — the
    copy-paste path was the unauthenticated one. `authorize: () => true` still works, but
    now someone wrote it on purpose. Vendor error bodies are summarised instead of relayed,
    because an OpenAI 401 hands the caller your key's prefix and tail.
  - **`streamRunner: runStreamAgent` finally typechecks.** Making it compile required
    narrowing `role`, mirroring the content-part union and the tool types, declaring
    `modelId`, and removing three index signatures from `@aparte/engine`'s mirror types. A
    consumer who wrote their own `StreamAgentMessage` may need to adjust.
  - `@aparte/engine` no longer re-exports `deriveArtifactKind` — it collided with
    `@aparte/core`'s export of the same name, with a different function behind it.
  - `escapeHtml` / `escapeAttr`, `AparteHostHandlersConfig` and `AparteKeyProvider` are now
    exported from `@aparte/core`.
  - **Ten exports are renamed**, before 1.0 makes their names permanent. The four classes
    gain the prefix every other class already carried, and the six shared defaults gain a
    namespace so they cannot collide with an app's own:

    | before                       | after                               |
    | ---------------------------- | ----------------------------------- |
    | `DirectTransport`            | `AparteDirectTransport`             |
    | `BackendTransport`           | `AparteBackendTransport`            |
    | `MessageRepository`          | `AparteMessageRepository`           |
    | `ConversationManager`        | `AparteConversationManager`         |
    | `DEFAULT_LOCALE`             | `APARTE_DEFAULT_LOCALE`             |
    | `DEFAULT_UI_EVENTS`          | `APARTE_DEFAULT_UI_EVENTS`          |
    | `DEFAULT_ICON_FALLBACKS`     | `APARTE_DEFAULT_ICON_FALLBACKS`     |
    | `DEFAULT_BUBBLE_ACTIONS`     | `APARTE_DEFAULT_BUBBLE_ACTIONS`     |
    | `DEFAULT_HOST_HANDLERS`      | `APARTE_DEFAULT_HOST_HANDLERS`      |
    | `DEFAULT_SKELETON_FALLBACKS` | `APARTE_DEFAULT_SKELETON_FALLBACKS` |

    Functions keep their verb names — `registerDefaultRenderers`, `contentToText`,
    `filesToAttachments` and the rest are unchanged, because prefixing a verb reads worse
    than the inconsistency it would fix.

  - **The config naming is inverted: `AparteConfig` is now the class, and the page-wide
    instance is `aparteGlobalConfig`.** `AparteConfigClass` is gone.

    ```diff
    - import { AparteConfig, type AparteConfigClass } from '@aparte/core';
    - AparteConfig.setMarkdownProvider(provider);
    - function configure(config: AparteConfigClass) {}
    + import { aparteGlobalConfig, type AparteConfig } from '@aparte/core';
    + aparteGlobalConfig.setMarkdownProvider(provider);
    + function configure(config: AparteConfig) {}
    ```

    One `sed` covers a whole consumer, and the order matters — run the instance first, so
    that `\bAparteConfig\b` cannot yet match the class:

    ```bash
    # 1. the instance, then 2. the class. Never the reverse.
    grep -rlE '\bAparteConfig(Class)?\b' src \
      | xargs perl -pi -e 's/\bAparteConfig\b/aparteGlobalConfig/g'
    grep -rl 'AparteConfigClass' src \
      | xargs perl -pi -e 's/\bAparteConfigClass\b/AparteConfig/g'
    ```

    It rewrites string literals too, so a log prefix of your own like `[AparteConfig]`
    becomes `[aparteGlobalConfig]` — harmless, but check your diff if you grep your logs.

    Two reasons this happens now rather than never. `AparteConfigClass` was not a name, it
    was an admission — the `Class` suffix existed only because the good name was taken by an
    object, and PascalCase means constructor everywhere else in the ecosystem, so
    `AparteConfig.setMarkdownProvider(...)` read as a static method to every reader. And the
    library moved under it: since config became per-instance, the global singleton is one
    config among several and the one we recommend least. Giving it the canonical name
    pointed at the case we want people to outgrow; `aparteGlobalConfig` says at every call
    site which config you are touching.

  - **`@aparte/provider-transformers`: `terminateWorker()` no longer bricks the provider.**
    Called while a generate was in flight, it dropped the pending streams but left their
    serialization slots unresolved — so the next `chat()` awaited a promise that could never
    settle. No error, no rejection: the stream simply never started again, for the life of
    the page. The worker-error path already released those slots, with a comment explaining
    why; `terminateWorker`, 240 lines below it, did not.

    Its state is still **tab-scoped, on purpose**, and now says so: one worker, one loaded
    model, one generate at a time, with `setComputeDevice` / `setMaxCachedModels` /
    `setHardwareTierModels` applying page-wide. A local model is 1–2 GB of weights and one
    WebGPU pipeline, so a worker per chat would mean N copies resident in one tab — the
    failure this package exists to avoid. Two chats on the same model share the load, which
    is the case it is for. Two chats on _different_ models serialize and, at the default
    budget of one cached model, can evict and reload gigabytes between turns — that used to
    happen in silence and now warns once, naming both models.

    `TransformersProvider.chat` is also declared non-optional now, so consumers stop needing
    `provider.chat!(...)`.

  - **Seven documented event contracts are gone, because those events never existed.**
    Not "undocumented" — the name appeared in the repo only in its own declaration.
    `aparte-artifact-open` sat in the event map with a detail type asserting it is
    "dispatched by the artifact pill when a user clicks it"; three hits repo-wide, all
    three its own declaration.

    | removed                             | why                                                                                                             |
    | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
    | `AparteTokenEventDetail`            | `aparte-token` is dispatched nowhere                                                                            |
    | `AparteMessageEventDetail`          | `aparte-message` is dispatched nowhere                                                                          |
    | `AparteStatusEventDetail`           | `aparte-status` is dispatched nowhere                                                                           |
    | `AparteToolActionDetail`            | its JSDoc names `aparte-tool-action`, which does not exist                                                      |
    | `AparteSegmentActionEvent`          | `aparte-segment-action` does not exist                                                                          |
    | `AparteConversationUnarchiveDetail` | a dead type on a live event — the dispatcher types both archive branches with `AparteConversationArchiveDetail` |

    Two were renamed rather than deleted, because their shape was right and only the
    event they named was wrong:

    ```diff
    - import type { AparteArtifactOpenEventDetail, AparteSegmentUpdateEvent } from '@aparte/core';
    + import type { AparteArtifactRedownloadEventDetail, AparteSegmentUpdateEventDetail } from '@aparte/core';
    ```

    `AparteArtifactRedownloadEventDetail` is field-for-field what the Download button
    really dispatches. `AparteSegmentUpdateEventDetail` was a detail, not an event, and
    had never reached a package entry point at all — so you could bind an event listed
    in the published API table and never name its detail. Same for
    `AparteConversationArchiveDetail`, now exported.

  - **Twenty events gained a typed `detail`, so the cast the docs promised you would
    never write is finally unnecessary.** The map carried 17 entries against 37 events
    that dispatch a detail. Fourteen had no declared type anywhere — including
    `aparte-file-gen-ready` / `-error`, where core renders a "Running sandbox…" card and
    waits on `window` for an event nothing in the library emits, so a consumer had to
    reverse-engineer six fields from an inline cast to make a binary artifact ever
    finish. Six more had a public detail type and still forced a cast at every listener.

    Additive for your code, and `check:event-map` now enforces both directions: an event
    with a detail must be in the map, and a map entry must correspond to a real event.

  - **`AparteThemeVariables` is `{ [K in `--aparte-${string}`]?: string }`.** It was a
    hand-written list of 33 CSS properties, ten of which are neither declared nor read
    anywhere in aparté — so it autocompleted ten knobs that do nothing — while the real
    surface is 254 tokens. You lose autocomplete and gain a type that cannot lie; the
    231 tokens the old list omitted, the whole `aparte-select` surface included, now
    typecheck. The discoverable list is the generated CSS-variables reference.

  - **One name for the imperative surface: `AparteChatImperativeApi`.** React exported it
    as `AparteChatHandle`, Vue and Svelte as `AparteChatInstance`, and Angular exposed no
    name at all — one contract wearing three names in a suite that publishes all four
    together in lockstep. Both aliases are gone; every wrapper now re-exports the canonical
    type straight from `@aparte/core`, which is also where its documentation lives, so the
    names cannot drift again.

    ```diff
    - import { AparteChat, useAparteChat, type AparteChatHandle } from '@aparte/react';
    + import { AparteChat, useAparteChat, type AparteChatImperativeApi } from '@aparte/react';
    ```

    Same rename for `AparteChatInstance` in `@aparte/vue` and `@aparte/svelte`. Nothing
    about the shape changed — it was already an alias of the same type in all three.

  - **`AparteAIProvider` is a union instead of one permissive interface.** It had three
    required members and fifteen optional ones, holding two mutually sufficient execution
    surfaces — a `chat()` that owns its own I/O, or the format-adapter surface a transport
    drives — discriminated at **runtime** by `isFormatAdapter()`. So
    `{ id, getMetadata, getModels }` typechecked, registered without a word, and failed on
    the first message. A half-built adapter (`buildRequest` but no `parseStream`) did the
    same, and so did a complete adapter with no way to present a key.

    Now the compiler answers "which half did you implement?". Every member of both
    surfaces stays reachable on the union — optional on the arm that does not require it —
    so `typeof p.buildRequest === 'function'` probes and `isFormatAdapter()` narrowing are
    unchanged, and a provider implementing both surfaces is still valid. If your provider
    was complete it compiles as before; if it was one of the shapes above, it never worked.

  - **Every satellite's peer on `@aparte/core` is now the lockstep range** (`~0.8.0`)
    instead of `>=0.5.0-alpha.0 <1.0.0`. The suite has always published in lockstep, so
    that range described a compatibility promise nobody was making or testing: npm was
    happy to install `@aparte/react@0.8.0` beside `@aparte/core@0.5.0`, and the failure
    landed at runtime with no warning at install. This very release makes the point —
    under the old range, `@aparte/react@0.8.0` would install against `@aparte/core@0.7.1`
    and then fail on an `aparteGlobalConfig` that does not exist there.

    If you install the packages together, or with `latest`, nothing changes. If you were
    pinning `@aparte/core` behind the wrappers, npm now tells you at install time instead
    of at first render.

  - `@aparte/svelte` ships its `.svelte` sources instead of a precompiled bundle, and
    supports Svelte 4 **and** 5 (`^4.0.0 || ^5.0.0`). Nothing to change in your code, unless
    you were importing from a deep path inside `dist`.
  - Every plugin `setup*` takes an optional trailing `config`, so a plugin can be scoped to
    one chat instead of the global singleton. Existing calls are unaffected.
  - `AparteClient` accepts `toolTimeoutMs`, matching `runStreamAgent`'s option of the same
    name — it was previously a hard-coded constant, so setting it worked on one loop only.

  **Security**

  Nine private copies of the HTML-escaping helper became one; three of them had drifted to
  leave the apostrophe through, which is enough to break out of a single-quoted attribute.
  42 unescaped attribute interpolations were swept (the audit reported 3). Segment lookups
  are scoped to their own children, so a decoy `data-segment-id` in model markdown can no
  longer hijack a human-in-the-loop control. A style declaration containing a backslash is
  rejected outright, and a `data:` image URL must name its subtype.

  `srcset` now goes through the same URL allowlist as `src`. It had only a
  `javascript:`/`vbscript:` substring test, so `srcset="data:text/html,<script>..." `
  passed untouched while the identical URL on `src` was rejected — one allowlist giving
  two answers depending on which attribute carried the URL. Each scheme in the value is
  validated rather than splitting on commas, because a legitimate base64 `data:` URL
  contains one.

  `data:image/svg+xml` is deliberately KEPT in the allowlist, contrary to an earlier plan
  to drop it: inside an `<img>` a data-URL SVG is secure-static in every engine (no
  scripts, no external fetches), and removing it would break a model emitting an inline
  chart. What it must not do is travel — an app that moves such a URL into an `<object>`,
  `<embed>` or an iframe leaves secure-static mode, and that constraint belongs to
  whoever re-hosts it.

  **Also in this release**

  - **Elicitation stops inventing refusals.** With no presenter registered,
    `requestUserInput()` resolved `{ action: 'cancel' }` in silence: your tool reported a
    refusal the user was never asked for, and the model answered as though they had
    declined. It still resolves `cancel` (a question nobody can render cannot be awaited)
    but now warns once, and the guide shows the `<aparte-elicitation>` element you must
    place — it registers itself on connect, so nothing happens until it is in your markup.
  - **`@aparte/svelte` publishes resolvable types.** `types` was not first in its
    `exports` block, and export conditions are order-sensitive, so TypeScript could not
    resolve the package's types at all. The `svelte` condition now carries its own `types`,
    matching how core's `node` condition is built.
  - `escapeHtml` / `escapeAttr` / `cssEscape` are documented with an example instead of
    being mentioned in passing: which one belongs in markup, which in an attribute, which
    in a selector, and why the apostrophe matters. They were exported all along while a
    comment in their own file claimed they were internal.
  - `AparteClientOptions.toolTimeoutMs` is in the config reference. The `config` argument
    every plugin `setup*` takes is documented with an example — it was named nowhere, and
    it is what lets two chats on one page use different providers.

  - **Segment renderers are per config too, so the `config` prop is now honest end to
    end.** `registerSegmentRenderer`, `unregisterSegmentRenderer`, `getSegmentRenderer`,
    `getAllRenderers`, `collectRendererStyles`, `registerDefaultRenderers` and
    `declineDefaultRenderers` all take an optional trailing config; omitted, they act on
    the ambient or global one exactly as before, so no existing call changes.

    This was the other half of the wrappers' promise. A plugin's providers were already
    scoped, but the registry deciding WHICH renderer draws a segment was a module-level
    Map — two chats on a page shared their segment renderers whatever config they were
    given. `AparteClient({ config, autoRegister: false })` was affected the same way: it
    declined the built-ins on the global config rather than on its own, muting the wrong
    chat.

  - `thinkingDelimiters` is documented, including the two pairs recognised by default and
    the fact that only the bring-your-own-loop path can reach it.

  **A Safari bug the new browser suite found, and closed**

  In framework mode — what every React / Vue / Svelte / Angular consumer runs — a streamed
  transcript settled a deterministic 31px short of the bottom on Safari and stayed there,
  so the last line of a reply sat under the fold. A timeline of a streamed turn showed the
  content settling in TWO layout passes (1118 → 1121 → 1152 px): `scrollTop = scrollHeight`
  ran against the middle one and nothing ran again afterwards. Auto-follow was armed the
  whole time — the viewport was not disarmed, it was satisfied, because "am I at the
  bottom?" is answered with a 50px tolerance that is right for keeping auto-follow armed
  and wrong as a definition of anchored.

  Fixed by a bounded re-check over the next few frames, which stops as soon as the gap is
  closed and re-reads the auto-follow flag every frame so a reader who scrolls away
  mid-settle is left alone. It exists only because a browser test drove a real progressive
  stream through a real engine; no unit test could see it, and the suite that shipped before
  this release delivered every reply atomically.
  <sub>every package</sub>

- [7d6652a](https://github.com/apartejs/aparte/commit/7d6652a): A third cold audit, and the one CRITICAL it found

  Five auditors, five dimensions, no access to the changelog or the git history —
  because a previous round proved seven of the maintainer's own claims false, and an
  auditor who reads the changelog is grading the essay rather than the code. One
  CRITICAL, twenty MAJOR. All twenty-one are closed here.

  **The CRITICAL, and its family.** `<aparte-elicitation>` registered its presenter
  on the config it could resolve at `connectedCallback`. All four wrappers call
  `AparteChatHost.bind()` — which runs `attachConfig` — from a post-mount hook, so
  the element connected _before_ the boundary existed and registered on the global
  singleton. `requestUserInput()` then resolved the instance config, found no
  presenter, and returned `{action:'cancel'}`: **the model was told the user refused
  a question the user was never shown.** Silent, and in the supported multi-chat
  path.

  An earlier sweep for this bug class fixed every element that READS its config live
  and missed both that WRITE to it — a write has already happened, so resolving live
  cannot save it. `attachConfig`/`detachConfig` now notify the subtree, and a
  registrant implements `AparteConfigAware.aparteConfigChanged(next, previous)`.
  Three MAJORs shared the root cause: `<aparte-model-selector>` cached its config
  (and its subscription) at connect; a segment renderer registered the documented way
  landed on the global and was invisible to any chat with a `config` prop — an
  instance config now inherits global registrations; and all four wrapper
  conversation-manager hooks wrote the manager to the global, making `config` +
  persistence a silently degraded mode. `init(adapter, config?)` on all four.

  **The streaming seam lost text three ways.** A non-streaming (string) reply skipped
  the parser flush, so a reply ending on a backtick or `<` lost that tail and one
  made only of those rendered nothing. The XML machine finalized _after_ the parser
  flush, so the text it hands back — always a prefix of `<artifact` — reached a
  parser that would never be flushed again; the loss was total. And the adapter's
  pre-tag path could add a segment but not update one that had just completed,
  freezing a code block mid-fence. The parity suite gained the two scenarios that
  missed all of this by a delta boundary, and it immediately rejected the core-side
  fix as well: it had split one sentence into two segments and put the held prefix
  _before_ the prose it follows.

  **Security.** The artifact preview's `<meta>` CSP was inserted relative to the
  first `<head>` the model's markup declared — and a meta policy governs only what
  follows it, so a `<script>` placed before that tag ran uncontained. Reproduced in
  Firefox, WebKit and csp-attribute-less Chromium; since the `csp` iframe attribute
  is Chromium-only, this meta is the only containment those engines get. Three
  branches collapse to one: always first. `AparteToolRenderer.render` now returns
  `string | HTMLElement` like its sibling, and both it and the guide say that
  `toolCall.input` is model-chosen. And the primary backend-handler snippet no longer
  satisfies the mandatory `authorize` gate with `Boolean(req.headers.get('cookie'))`,
  which authenticates nothing.

  **Migration.** `getHostHandlers()` returns `Required<AparteHostHandlersConfig>` —
  four fields, `artifactRehydrate` included. `AparteToolRenderer.render` widened, so
  existing string renderers keep working. The page-global config moved to a versioned
  `Symbol.for` key: two copies of `@aparte/core` on one page now get one global each
  instead of sharing an object across which `instanceof` is false. The `shiki` and
  `marked` peer ranges narrowed to the majors this repo tests against (`^4` and
  `^18`) — an over-narrow peer is a warning you can override, an over-wide one is a
  lie.

  **Six of the twenty MAJORs were defects in the guards themselves**, which is the
  part worth reading twice. Seven gate steps ran in no CI workflow, five of them
  guards that bite — and the only place their names appeared under `.github/` was a
  comment narrating a previous audit finding the same thing. `check:gate-in-ci` now
  diffs the workflow against the gate chain. `check-event-map` was blind to
  object-shorthand `detail`, exempting the ten most important events.
  `check-doc-snippets` waived every diagnostic in a fence containing one unresolved
  name — 44 of 118 fences, hiding two `for await` SyntaxErrors in the branching
  guide. `check-bundle-entries` read a re-export shim and skipped the chunk where
  core lives, and could not have seen an inlined dependency at all, so it gained an
  assertion that core's manifest declares none. `check-export-mentions` could not see
  type-only exports; measured once it could, 141 public exports were named on no
  page, now on a per-package ratchet that a new component cannot raise.
  <sub>`@aparte/core`, `@aparte/engine`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [d3e482c](https://github.com/apartejs/aparte/commit/d3e482c): The question panel: right chat, readable schema, replaceable field

  Eleven defects in the elicitation surface — the panel a tool puts up when it has to
  ask the user something. They survived four from-scratch audits for one reason, and it
  is the most useful thing in this release: **no tool ever reached the model, so this
  surface was never executed.** Not badly audited. Never run. Its unit tests pinned the
  shape it had and said nothing about which chat anything belonged to, what the model
  was asked to fill in, or what a screen reader would hear.

  One person with a local model broke it in four places in twenty minutes.

  **Which chat a question belongs to.** `<aparte-elicitation>` could mount its panel in
  ANOTHER chat's composer: it walked up looking for one and fell back to
  `document.querySelector`. Removing that fallback was not enough — the walk itself
  reached `<body>`, where a `querySelector` searches the whole document, so it found
  the other chat's composer by a longer route. The walk now stops at the chat boundary
  and finding nothing cancels with a warning that names the fix. A Stop in one chat also
  cancelled the question another was waiting on, telling that chat's model the user had
  refused something they were still reading — the two `window` listeners had no instance
  filter at all. And in RAW core the composer could not identify itself either (all four
  wrappers set `target`; hand-written markup does not), so one chat's Stop tore down the
  other's open panel while its tool call kept waiting.

  **What the model is asked to fill in.** A question with no options was schema-VALID:
  `options` was neither required nor given a `minItems`, and the 2–6 range lived in the
  system prompt as prose. A local model duly sent two questions with no options, and the
  panel rendered a radio list whose only entry was "Other…" — a text box wearing the
  costume of a choice. `options` is now required with `minItems: 2`, and a model that
  ignores that gets an honest labelled text field instead of an empty `enum`. The
  question text also stopped being the object property KEY: two identically-worded
  questions used to collapse into one field, and the field was labelled only because the
  panel falls back to printing the key. Stable keys now, the text as the field's `title`,
  and a label map so the model still reads "question → answer".

  **Who decides the UX.** `allow_other` is out of the model's schema and becomes
  `setElicitationOptions({ allowOther })` on the config. The model describes the
  question; the host owns the surface. Default `true`, so nothing a user sees changes —
  only who gets to say so. A model still sending it is ignored, so no existing call
  breaks. A field of a schema you build yourself can still set `allowOther`, and it wins.

  **What the user sees.** The composer kept offering the attachment picker through an
  entire elicitation — there is nowhere for a file to go while you are answering a
  question. Declared now with `data-panel-active` + CSS instead of an inline
  `style.display` that clobbered a consumer's own value. Groups of choices are named by
  the question they answer (`role="radiogroup"`/`group` + `aria-labelledby`): a screen
  reader used to announce "Chromium, radio button, 1 of 2" with no question attached.
  Seven strings that were hardcoded English — "Other…", its placeholder and accessible
  name, "Skip", "Yes", "No", "Your answer" — are optional locale keys with per-key
  fallback, plus the French. And the panel's CSS moved out of a JS-injected `<style>`
  into the stylesheet with fifteen `--aparte-elic-*` tokens: it was the one surface that
  could not be themed, its variables were absent from the generated reference, and the
  injection was never re-created if anything removed it.

  **How several questions are asked.** A form of two or more questions put them all in
  one box — a shape inherited from MCP elicitation without being examined. MCP describes
  a form for collecting structured data; asking a person two different questions in the
  middle of a conversation is not that, and no product does it by stacking. Several
  questions are now asked ONE AT A TIME, with a chip per question that is also how you go
  back. Each field takes a short `header` for that chip (the tool schema asks the model
  for two or three words) and falls back to the question's position rather than
  truncating a sentence. The protocol is untouched: the answer is still one object with
  every key, and the composer's send button still means submit. `layout: 'stacked'`
  keeps the form case, which is real — it was just never the right default.

  The composer's one button carries the progression: a chevron while questions remain,
  a check on the last one, and the panel is what knows which. That is why there is no
  "Next" button — the composer already has a button, in a place the user knows, and it
  already changes meaning between sending and stopping. Adding a second row for a Next
  made the panel taller and made it change height when that row went; folding the meaning
  into the existing button removed both problems and the button now says what it does.

  And the escape from the whole request sits in the panel's CORNER, not in a row beside
  the button that advances through the form: adjacency promised "skip this question"
  while it declines everything. Position, not decoration — which is also why the
  reference implementations put theirs in a corner.

  **What a consumer can replace.** `setElicitationFieldRenderer` renders one field while
  the panel keeps everything around it. It returns a control rather than
  `string | HTMLElement` because a field must hand back a value, and the schema
  vocabulary is now a stated contract — three field kinds plus the object form, closed,
  with a test pinning the count so it cannot grow quietly.

  **Migration.** `allow_other` is ignored rather than rejected. The panel's pixels can
  move if you were overriding its rules by selector — that is the trade for being able to
  override them by token. An `<aparte-elicitation>` mounted outside any chat now cancels
  with a warning instead of borrowing the first composer on the page. `AparteLocale`
  gains seven OPTIONAL keys, so an existing locale package keeps compiling and keeps
  rendering English.

  Twenty-six new unit tests and five browser tests — the first browser coverage this
  surface has ever had. Every fix has its sabotage, and one of them refuted a claim of
  mine before it shipped: the new axe scan does NOT catch an unnamed radio group, so the
  comment saying it would is corrected in place and the unit tests are named as the real
  guard.
  <sub>`@aparte/core`, `@aparte/plugin-ask-user`, `@aparte/locale-fr`</sub>

- [1603015](https://github.com/apartejs/aparte/commit/1603015): No tool ever reached the model, and three smaller things a first test session found

  All four of these came out of one person sitting down with the examples and a local
  LM Studio, which found in twenty minutes what four from-scratch audits had not. The
  pattern is worth naming: an audit reads the code, a user runs it.

  **A registered tool was never sent.** `AparteClient` gates the request's `tools`
  array on `getCurrentModel()?.capabilities?.includes('function_calling')`. Three
  facts made that gate permanently closed on the documented primary path:
  `getCurrentModel()` read `provider.getModels()` — the synchronous, hand-declared
  list — which every preset of `@aparte/provider-openai-compat` leaves empty because
  a compat endpoint's list only exists after a `GET /models`; `fetchModels()` never
  wrote its result anywhere the resolver could see; and it declared only
  `['streaming']`. So `getTools()` held the tool the app had registered and
  `tools: []` went on the wire. The model then answered, correctly, that it had no
  such tool — which is exactly what a tester saw, with no error and no warning
  anywhere. The whole tools guide, `needsApproval`, human-in-the-loop approval and
  `@aparte/plugin-ask-user` were inert.

  Three changes, each with the reasoning where it lives. `AparteConfig` caches what
  `refreshProviderModels()` brings back and `getCurrentModel()` consults it before
  the static list. `openai-compat` declares `function_calling`, because a `tools`
  array is a property of the wire format it implements, not a guess about the model —
  `/models` returns `{id, object, owned_by}` and will never say otherwise, so waiting
  for it to declare the capability means never declaring it. And the gate now asks
  whether the model said it CANNOT rather than whether it said it can: a model that
  declares its capabilities and omits function calling is still honoured, but an
  unknown model — the common case — no longer turns an explicit `registerTool` into a
  silent no-op. Over-sending means a model that cannot call a tool does not call one;
  under-sending was silent and total. Two end-to-end tests that had been parked on
  this decision are now running.

  **`requireModelSelection` is enforced by the thing that runs the turn.** It was
  drawn by `aparte-composer` — greying itself, refusing `submit()` — and enforced
  nowhere else, so any other route to an `aparte-send` walked past it: a suggestion
  chip, a "try this prompt" button, a host dispatching the event itself. The turn
  then ran with `config.defaultModel || ''`, an empty model id on the wire. Reported
  from an example, where the chips above the composer stay clickable while the
  composer is visibly greyed out waiting for its model list. The client now refuses
  such a send and says why, because the developer is who can fix it — an app that
  gates should disable its own affordances too.

  **The model selector's dropdown was ordered by a race.** It fetches every
  provider's `/models` in parallel and pushed each result as it arrived, so the order
  — and therefore what `auto-select` lands on — was decided by whichever endpoint
  answered first. A cloud provider on a CDN beats a local server that has to wake up,
  which means an app registering `[local, local, cloud]` could land on the paid one,
  and on a different one after a reload. The list is indexed by registration order
  now: `auto-select` documents itself as "the first model", and first has to mean
  first.

  **And the guide that described the old gate** said tools are sent "only when the
  selected model's `capabilities` include `function_calling`", which was true and is
  the sentence that made the behaviour look intended rather than broken.
  <sub>`@aparte/core`, `@aparte/provider-openai-compat`, `@aparte/plugin-model-selector`</sub>

- [950261d](https://github.com/apartejs/aparte/commit/950261d): The `<artifact>` XML streamer is a file, and its twin no longer disagrees with it

  `@aparte/core` and `@aparte/engine` each carry a hand-maintained copy of the same
  streaming `<artifact>` state machine — core cannot import engine's, because engine
  peer-depends on core. Keeping two copies in step is the whole contract, and until
  now core's half had no name: it was a private method plus a nested block inside a
  2324-line class, so the two files cited each other by **line number**. Four of six
  of those citations had rotted onto unrelated code. `:1658-1669`, sold as "the
  finalize block", was a tool handler's `AbortController`; `:1034-1042`, sold as
  "`_streamLoop`'s leading writes", was `_handleSend` resolving auth. One of the wrong
  ones was published in the API reference.

  Core's half now lives in `client/xml-artifact-feed.ts`, holding both halves the way
  engine's file does — `feedXmlArtifactDelta` and `finalizeXmlArtifact`. It moved
  without a semantic change: it dereferences `this` zero times, because the state it
  mutates was always owned by its caller. Every citation between the two files is now
  a name, and a new gate guard (`check:cross-refs`) refuses a comment that cites code
  by line number at all.

  **Bug fixed, found by the pairing.** A stream that ended on a held partial tag —
  `… <arti`, then nothing — silently dropped those characters. The feeder holds such a
  suffix on purpose (without it, a tag split across deltas loses the artifact's whole
  lifecycle), and engine's `finalize()` has always handed the held text back as chat
  text. Core's finalize only ever handled the `in-artifact` case. Reachable with
  nothing unusual: any truncated reply whose last delta happens to end on `<`, `<a`, …
  `<artifac`.

  No API change: `AparteClient` behaves identically apart from that fix, and the new
  module's exports are not re-exported from the package barrel.
  <sub>`@aparte/core`, `@aparte/engine`</sub>

- [c87d2b2](https://github.com/apartejs/aparte/commit/c87d2b2): `@aparte/plugin-ask-question` is now `@aparte/plugin-ask-user`, and the tool is `ask_user`

  A rename, decided by looking at what the ecosystem actually calls this rather than at
  what we had called it.

  There are two naming levels and they answer differently. The **protocol** level has a
  standard — MCP calls it _elicitation_ (`elicitation/create`), and ours already matched:
  `requestUserInput`, `AparteElicitation*`, `<aparte-elicitation>`. The **tool** level has
  no formal standard but a clear convention, and it is `ask_user`: Claude Code's
  `AskUserQuestion`, `datasette-agent`'s `ask_user()`, `pi-ask-user`,
  `ask-user-questions-mcp`. `ask_question` was ours alone.

  **What changed**

  - the package: `@aparte/plugin-ask-question` → `@aparte/plugin-ask-user`
  - the tool the model is offered: `ask_question` → `ask_user`
  - the element alias: `<aparte-ask-question>` → `<aparte-ask-user>`, class
    `AparteAskQuestion` → `AparteAskUser`
  - the exports: `askQuestionTool`/`askQuestionHandler`/`setupAskQuestion` →
    `askUserTool`/`askUserHandler`/`setupAskUser`, and
    `AskQuestionOption`/`Item`/`Detail` → `AskUser*`

  **What did NOT change, deliberately.** The receipt keeps its names —
  `questionReceiptRenderer`, `QuestionReceiptSegment`, and the `'question-receipt'`
  segment type. They name the ARTIFACT (a question and the answer it got, kept in the
  transcript), not the tool that produced it, and that segment type is a public string an
  app can emit on its own. Renaming it would break those apps for no gain.

  **Migration.** Change the dependency name, and the four identifiers above. No alias and
  no shim: this library is pre-1.0 and breaks cleanly rather than accumulating two names
  for one thing. The old package name stays on npm at its last published version and will
  receive nothing further — nothing is unpublished, so an existing install keeps working
  until it is updated.

  A model that keeps calling `ask_question` gets no tool by that name, which surfaces as
  an unknown-tool error rather than silence.
  <sub>`@aparte/plugin-ask-user`</sub>

### Patch Changes

- [c87d2b2](https://github.com/apartejs/aparte/commit/c87d2b2): `@aparte/plugin-ask-question` is now `@aparte/plugin-ask-user`, and the tool is `ask_user`

  A rename, decided by looking at what the ecosystem actually calls this rather than at
  what we had called it.

  There are two naming levels and they answer differently. The **protocol** level has a
  standard — MCP calls it _elicitation_ (`elicitation/create`), and ours already matched:
  `requestUserInput`, `AparteElicitation*`, `<aparte-elicitation>`. The **tool** level has
  no formal standard but a clear convention, and it is `ask_user`: Claude Code's
  `AskUserQuestion`, `datasette-agent`'s `ask_user()`, `pi-ask-user`,
  `ask-user-questions-mcp`. `ask_question` was ours alone.

  **What changed**

  - the package: `@aparte/plugin-ask-question` → `@aparte/plugin-ask-user`
  - the tool the model is offered: `ask_question` → `ask_user`
  - the element alias: `<aparte-ask-question>` → `<aparte-ask-user>`, class
    `AparteAskQuestion` → `AparteAskUser`
  - the exports: `askQuestionTool`/`askQuestionHandler`/`setupAskQuestion` →
    `askUserTool`/`askUserHandler`/`setupAskUser`, and
    `AskQuestionOption`/`Item`/`Detail` → `AskUser*`

  **What did NOT change, deliberately.** The receipt keeps its names —
  `questionReceiptRenderer`, `QuestionReceiptSegment`, and the `'question-receipt'`
  segment type. They name the ARTIFACT (a question and the answer it got, kept in the
  transcript), not the tool that produced it, and that segment type is a public string an
  app can emit on its own. Renaming it would break those apps for no gain.

  **Migration.** Change the dependency name, and the four identifiers above. No alias and
  no shim: this library is pre-1.0 and breaks cleanly rather than accumulating two names
  for one thing. The old package name stays on npm at its last published version and will
  receive nothing further — nothing is unpublished, so an existing install keeps working
  until it is updated.

  A model that keeps calling `ask_question` gets no tool by that name, which surfaces as
  an unknown-tool error rather than silence.
  <sub>`@aparte/core`</sub>

## 0.7.1

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Patch Changes

- [4a180af](https://github.com/apartejs/aparte/commit/4a180af): The composer no longer sits flush against the bottom edge of the chat.

  Spotted in two live apps: as soon as a conversation started, `center-empty` stopped
  centering the composer and it touched the bottom of the screen. That was an **asymmetry in
  core's own spacing**, not a layout choice — the viewport puts 16px between the last bubble
  and the composer, and there was nothing below it.

  It is core's to fix rather than the app's, because an app cannot express it from outside:
  padding the container also shrinks the scroll area, so the transcript would stop before the
  edge instead of scrolling to it.

  New token, with the same 16px the viewport already uses on its other sides:

  ```css
  /* flush composer — a full-bleed mobile shell with a docked keyboard */
  aparte-chat {
    --aparte-chat-bottom-gap: 0;
  }
  ```

  Visible change: every full-height chat gains 16px under its composer. Applies to the
  vanilla element and to all four wrappers.

  A **patch**, not a minor: this corrects an asymmetry in core's own spacing, and the new
  token is the escape hatch for the correction — a way back to the previous rendering — not
  a capability anyone asked for.
  <sub>`@aparte/core`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.7.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [acb1e37](https://github.com/apartejs/aparte/commit/acb1e37): **Breaking:** the composer's three positional footer slots become one `toolbar`.

  `footerLeft` / `footerCenter` / `footerRight` (and their `footer-left` / `footer-center` /
  `footer-right` slot equivalents) are removed. Pass one `toolbar` instead and order your
  controls yourself:

  ```tsx
  // before
  <AparteChat footerLeft={<ModePicker />} footerRight={<ModelSelector />} />

  // after
  <AparteChat toolbar={<>
    <ModePicker />
    <ModelSelector style={{ marginInlineStart: 'auto' }} />
  </>} />
  ```

  Placement inside the row is the DOM order; `margin-inline-start: auto` pushes a control —
  and everything after it — to the end. It is a _logical_ property, so a control that used to
  be in the right-hand slot now follows the reading direction instead of contradicting it in a
  right-to-left locale.

  Vue uses `<template #toolbar>`, Svelte `<svelte:fragment slot="toolbar">` (a fragment
  projects several nodes with no wrapper element), Angular `slot="toolbar"` on each projected
  node.

  **New in core:** `<aparte-composer-toolbar>`, the element the row actually is. It works in
  plain HTML with no wrapper, which the row never did before — vanilla consumers had to write
  `<div class="aparte-composer-footer">` by hand. It hides itself while empty, and it is not
  part of the default `<aparte-chat>` shell: nothing is drawn until you put something in it.

  **Also in core:** `<aparte-composer>` now mirrors the locale's reading direction onto
  itself. `dir` was applied by the viewport alone, so an RTL locale flipped the transcript and
  left the composer left-to-right — which also made any logical margin inside it behave like a
  physical one.
  <sub>`@aparte/core`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/locale-fr`.</sub>

## 0.6.1

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Patch Changes

- [2075f9b](https://github.com/apartejs/aparte/commit/2075f9b): README fix: the npm page announced "🚧 **Pre-alpha** — not yet published to npm" —
  false on the very page npm was serving, and it had been through four releases. It now
  states what the package is (alpha, plain `0.x`, lockstep, API can still change) and
  links the changelog.

  The quick start went with it: it showed `registerDefaultRenderers()` as a required
  step (the built-ins install themselves since 0.5.0-alpha.0) and stopped before the one
  line that makes the retry/edit buttons appear now that they ship off. It also pointed
  at the docs _sources_ in the monorepo rather than at apartejs.dev.
  <sub>`@aparte/core`</sub>

- [0c4c0e3](https://github.com/apartejs/aparte/commit/0c4c0e3): **Fix: a locale switch now reaches the components already on screen.** The docs say
  it plainly — "a locale switch is live: mounted components re-render immediately" — and
  `setLocale()` does notify. The components honoured only part of it, so switching
  language left a **bilingual** interface until a reload rebuilt the elements:

  - a **bubble** rebuilt its action-bar labels but kept its old name (`You` /
    `Assistant`), its avatar initial, the `aria-label` of the `‹ ›` branch arrows and of
    the action toolbar, and the waiting indicator's screen-reader label;
  - a **viewport** applied `locale.direction` once at render, so a chat already mounted
    never flipped to **RTL**;
  - a **conversation list** kept its previous-language row labels (the delete/archive
    buttons, and the fallback title of an untitled conversation) until something else
    happened to re-render it.

  All three now refresh on the config change, keeping the existing precedences: an
  explicit `name` attribute still outranks the locale, and an instance-scoped config
  change never touches a component resolving to another config.
  <sub>`@aparte/core`</sub>

- [6e0211c](https://github.com/apartejs/aparte/commit/6e0211c): **Fix: refreshing a live option list no longer throws away the keyboard position.**

  `aparte-select` keeps its roving highlight as a `data-active` attribute on an option
  ELEMENT, so replacing the options of an open dropdown took it away — while the
  component still believed it held a position. Consequences, all silent:

  - the visible highlight disappeared mid-navigation;
  - `aria-activedescendant` on the trigger kept pointing at an id no longer in the
    document — a broken reference for a screen reader;
  - the next arrow key moved from the stale index.

  Worse, nothing noticed: a consumer refreshing a list writes into
  `.aparte-select-options`, a **descendant**, and the observer watched only its own
  children. It now watches the subtree and re-asserts the highlight on the new elements,
  clamped to the new length, and only when the dropdown was already open with a position
  held — a refresh never invents one, and navigation resumes where the user was rather
  than jumping back to the top.

  Found via three CI-only e2e flakes (a keyboard-navigation assertion polling ten seconds
  for a highlight that a concurrent refresh had erased). `@aparte/plugin-model-selector`
  is the in-repo consumer that triggers it, whenever the provider list settles.
  <sub>`@aparte/core`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.6.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [583840f](https://github.com/apartejs/aparte/commit/583840f): **New entry point `@aparte/plugin-shiki/core`, for control over what you ship.**

  The convenience entry imports `shiki`, whose bundle maps every known language to a
  dynamic import — so a bundler emits one chunk per grammar. Measured on a build whose
  only import was `setupShikiProvider`: **302 files, 11 MB** (`emacs-lisp` alone is
  780 kB, plus `wasm`, `wolfram`, `vue-vine`… for a chat that will show twenty
  languages). The same build against a highlighter carrying three grammars: **1 file,
  560 kB**.

  No runtime option can fix that — verified rather than assumed: restricting shiki's
  `langs` still emitted all 302 files, because a static import is a static import. So
  the fix is an entry point that never imports the bundle:

  ```ts
  import { createHighlighterCore } from "shiki/core";
  import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
  import ts from "@shikijs/langs/typescript";
  import githubDark from "@shikijs/themes/github-dark";
  import { setupShikiProviderFromHighlighter } from "@aparte/plugin-shiki/core";

  setupShikiProviderFromHighlighter(
    await createHighlighterCore({
      themes: [githubDark],
      langs: [ts],
      engine: createJavaScriptRegexEngine(),
    }),
  );
  ```

  `@aparte/plugin-shiki/core` imports nothing from `shiki` at runtime (types only, and
  those are erased). The trade is stated where you make it: your highlighter's grammars
  are fixed, so a language it does not carry renders as plain text — there is no
  on-demand load to fall back on. Everything else matches the convenience entry,
  plaintext aliases and case-insensitive matching included.

  Nothing is removed and no default changes: `setupShikiProvider` behaves exactly as
  before. Its JSDoc — and the plugin's docs page — stop implying that lazy loading also
  means a small package: "you pay only for the languages you render" was true of
  _runtime_, never of _distribution_.
  <sub>`@aparte/plugin-shiki`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/core`, `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.5.0-alpha.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [cd7adfc](https://github.com/apartejs/aparte/commit/cd7adfc): **Only the affordances core can honour end-to-end are enabled by default.** A button
  that answers to nobody is worse than a missing feature — the user clicks it and
  concludes the app is broken. Six controls were in that state, and the proof it had
  gone unnoticed is that not one of our own six playgrounds handled
  `aparte-message-info`, `aparte-attachment-preview` or `aparte-terminal-run`.

  Core copies text on its own, so `copy` stays on. Everything else now waits for the
  app to say it is there:

  | Control                         | Needs                          | Was                     | Now |
  | ------------------------------- | ------------------------------ | ----------------------- | --- |
  | `retry`                         | a host that re-sends           | on                      | off |
  | `edit`                          | a host that keeps the new text | on                      | off |
  | `info` (ⓘ)                      | your stats popover             | on, **and unremovable** | off |
  | image-tile preview              | your lightbox                  | always                  | off |
  | terminal `Run`                  | your executor                  | always                  | off |
  | download on a _binary_ artifact | your file generator            | always                  | off |

  Edit was the worst of them: it opened, accepted text, saved — and the original text
  came back, because replacing it is the client's job.

  **Migration** — if you run `AparteClient` (or handle the events yourself), one line
  restores the action bar you had:

  ```ts
  AparteConfig.setBubbleActions({ retry: true, edit: true });
  ```

  and for the three affordances outside the bar, declare what you handle:

  ```ts
  AparteConfig.setHostHandlers({
    attachmentPreview: true,
    terminalRun: true,
    artifactRedownload: true,
  });
  ```

  No event and no API was removed — core just stops offering what nobody answers. Also
  in this release:

  - **`info` is a bubble action like the others.** It was pushed at the tail of the flag
    branch: impossible to turn off, and impossible to request in an explicit per-role
    list (`'info'` was not an `AparteBubbleActionName`). Both directions work now.
  - **A declared image tile is a real button** — `role="button"`, a tab stop and
    Enter/Space — instead of a `<div>` with a click listener. Undeclared, it carries no
    role and no pointer cursor: half-signalling is the same lie in a quieter voice.
  - **An empty action bar is no longer rendered.** With every action off it stayed as a
    `role="toolbar"` holding nothing and still reserved 28px under every bubble. The
    bar and the footer now follow their contents (a branch picker alone still gets its
    row).
  - New exports: `setHostHandlers` / `getHostHandlers`, `DEFAULT_BUBBLE_ACTIONS`,
    `DEFAULT_HOST_HANDLERS` — read the defaults instead of hard-coding them.

  Untouched on purpose: `copy` on a terminal segment, download on a **text** artifact,
  the `‹1/2›` branch picker, the waiting indicator, the stop button and the model
  selector — core honours all of those itself.
  <sub>`@aparte/core`</sub>

- [3edb766](https://github.com/apartejs/aparte/commit/3edb766): **The built-in segment renderers install themselves the first time a segment needs
  one.** `registerDefaultRenderers()` had exactly one caller: `new AparteClient()` —
  the object the _bring your own loop_ guide tells you not to construct. A
  display-only app therefore rendered `[Unknown segment type: text]` for every reply,
  with working bubbles, working streaming and working scroll, so the only thing missing
  was the content and it read as a bug in the consumer's own loop. The _bring your own loop_ guide never
  mentioned the call either — it was documented as **required** on the Getting-started
  page (and in both READMEs), so this was one path missing a note, not an undocumented
  API. But a required call whose only correct answer is always "yes, call it" is
  ceremony, not a decision: nobody wants `text` segments rendering as
  `[Unknown segment type: text]`.

  The sweep is **strictly additive**: a renderer you registered yourself is never
  replaced, so a custom `text` renderer survives the install a `code` segment triggers.
  `registerDefaultRenderers()` still works and is still what the examples do — it is
  simply no longer the difference between a chat that renders and one that doesn't.

  `AparteClient({ autoRegister: false })` still means what it says: declining is
  remembered, so nothing installs the built-ins later. Do it at startup, before the
  first segment renders.

  The unknown-type warning now names the fix for the case that remains (a type core has
  never heard of) instead of pointing at a call you no longer need.
  <sub>`@aparte/core`</sub>

### Patch Changes

- [3b026bb](https://github.com/apartejs/aparte/commit/3b026bb): **Fix: streaming a segment with `appendToSegment` wrote every chunk twice** — in the
  message model and on screen ("BonjourBonjour le le monde"), which shows up as a word
  appearing twice as the reply streams in.

  One object, two writers. `addSegment` hands the **same segment object** to the
  message model and to the bubble, and `appendToSegment` then advances it from both
  ends: the viewport appended the chunk in place, and the bubble — holding that very
  object — appended it again. On the framework-managed path a third writer joined in,
  the coalesced once-per-frame state sync, which added the chunk on top of content
  that already had it.

  Both sides now own the value they advance: the viewport **replaces** the segment
  instead of mutating it, and the per-frame sync writes an **absolute** target
  (captured before the paint) rather than a delta. Same two writes, same single
  render per frame — no shared mutable state between them.

  Why no test caught it: `AparteClient` never calls `appendToSegment`. It writes
  segment text with `updateSegment` (absolute content), so every path our own examples
  and browser suite exercise went around this one — `appendToSegment` is the API a
  caller driving its own loop uses. Its only unit coverage ran against a _mocked_
  viewport, and a paint that writes nothing cannot double-count. The regression tests
  added here drive the real viewport and the real bubble, on both the raw-core and the
  framework-managed path, and assert exact text rather than a substring — the weakness
  that also let the browser suite stay green.
  <sub>`@aparte/core`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.4.0-alpha.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [50d90a8](https://github.com/apartejs/aparte/commit/50d90a8): **The waiting state now exists.** Between "user sends" and the first token there was a bubble
  with a name and an empty body — and, in the display-only path, copy/retry on a reply that
  hadn't happened. The bubble now shows a built-in indicator while it is in flight with nothing
  in it: animated dots (CSS, so no per-token work, themable via `--aparte-waiting-*`, and
  already covered by the reduced-motion rule) plus a screen-reader label taken from
  `locale.typing` — a string that shipped in `DEFAULT_LOCALE` and was read by nothing until now.

  No wiring: it works in raw `<aparte-chat>`, in the four wrappers, and in a hand-rolled loop.
  `<aparte-chat-status>` / `isTyping` stay **your** channel for your own status ("indexing your
  files"), which is why they are not auto-driven.

  New export **`isAwaitingReply(message)`** — the one rule core and all four wrappers now share
  for "is this bubble in flight". Besides `status: 'streaming' | 'pending'`, it also covers an
  **assistant message with no `status` at all and nothing in it**: the empty shell a token stream
  is about to fill. That case used to render as a finished reply, action bar included. Only
  silence is interpreted — an explicit status, `'completed'` on an empty message included, is
  believed.

  If you deliberately append empty assistant bubbles that no stream will fill, give them an
  explicit `status` (e.g. `'completed'`) or they will show the indicator.
  <sub>`@aparte/core`</sub>

- [cda5f54](https://github.com/apartejs/aparte/commit/cda5f54): `<aparte-chat>` gained an **`attachments`** attribute: it adds the file picker
  (`<aparte-composer-add-attachment>`) and the chips strip (`<aparte-composer-attachments>`)
  to the default composition, in their canonical positions. It is reactive — toggling it
  after mount inserts or removes the two primitives, and removing it also drops any file
  already staged in the composer (keeping them would send files with nothing in the UI
  showing them).

  Nothing changes without the attribute: the default composition is still
  `viewport + composer(input · send)`. Attachments are **opt-in** because the capability
  needs a host that consumes the files — an `AparteClient` inlines them per its
  `rawFileInject` option, but a hand-rolled loop has to read `event.detail.files` or the
  user's file is dropped in silence. Composing your own composer? Keep dropping the two
  primitives in wherever you want them, as before.
  <sub>`@aparte/core`</sub>

- [e9909c6](https://github.com/apartejs/aparte/commit/e9909c6): New exported helper `filesToAttachments(files)`: turns the `File[]` an
  `aparte-send` event carries into the `AparteAttachment[]` a bubble renders (id,
  MIME type, object URL, and the raw `File` kept for storage adapters).

  This conversion already existed inside `ConversationController`, so framework
  wrappers had it — but a raw-core consumer driving `appendMessage()` itself had to
  hand-roll object URLs, and silently rendered attachment-less bubbles if it
  didn't (the vanilla playground did exactly that). The controller now uses the
  same helper, so there is one implementation.
  <sub>`@aparte/core`</sub>

- [fcacade](https://github.com/apartejs/aparte/commit/fcacade): `runStreamAgent` gained an optional **`onHistoryAppend`** hook: it reports every turn the loop
  appends to the history — the grouped `tool_call` envelope, each `tool_result` (resolved or
  rejected), and a pipeline phase's reply — in order, and always before the transport call that
  would carry it. Messages you passed in `baseRequest` are never reported: you already have them.

  This makes the loop usable by hosts that **own their own transcript**. It re-sends its message
  array every turn, which fits a stateless message API but not a prefix cache (llama.cpp slots,
  vLLM), where turn N+1 must _extend_ turn N byte for byte. Such a host already controlled the
  request — `transportCall` may ignore `request.messages` — but had to reimplement the loop's
  tool_call/tool_result bookkeeping to keep its own log in sync. Now it just mirrors the
  notifications.

  No core change is needed to use it through the `streamRunner` seam:
  `streamRunner: (opts) => runStreamAgent({ ...opts, onHistoryAppend })`. Omitting the hook leaves
  behaviour byte-identical — pinned by a test that compares the event stream and the per-turn
  requests with and without it.
  <sub>`@aparte/engine`</sub>

- [0aa386e](https://github.com/apartejs/aparte/commit/0aa386e): **Behavior change:** the default composer shell no longer mounts the file picker. All four
  wrappers gained an `attachments` prop (`false` by default) that adds
  `<aparte-composer-add-attachment>` + `<aparte-composer-attachments>` back.

  **Migration:** if your chat offers file attachments, add the prop —
  `<AparteChat attachments />` (React/Svelte), `<AparteChat attachments />` /
  `:attachments="true"` (Vue), `<aparte-chat attachments>` (Angular). Passing your own
  `composer` is unaffected: you place the primitives yourself, as before.

  Why: the picker was hard-coded in the four wrapper templates while core's own
  `<aparte-chat>` default shell never had it — so "the default composer" meant two different
  things depending on where you looked, and the docs described the wrong one. And the
  capability is only real if the host consumes the files: an `AparteClient` inlines them per
  its `rawFileInject` option, but an app driving its own loop must read `event.files` or the
  file the user deliberately attached is dropped in silence, with the UI still showing it was
  sent. Opting in is now that acknowledgement.
  <sub>`@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

### Patch Changes

- [358bc53](https://github.com/apartejs/aparte/commit/358bc53): `appendToSegment` no longer costs a full framework render per token. It used to
  rebuild the message list and call `setMessages` + `onMessagesChange` on every
  chunk — while the plain-text path (`appendToken` / `injectTokenStream`) wrote
  straight into the bubble. Streaming a thinking block or a tool pill from a fast
  local model was therefore unusable, and nothing in the imperative API hinted that
  the two methods differed so much.

  Chunks now go straight to the bubble as before-and-immediately, and the framework
  state is synced **once per frame** (`requestAnimationFrame`, falling back to a
  macrotask where it doesn't exist). Any structural change — a new segment, a new
  message, a conversation swap — flushes the buffer first, so ordering is never
  observable. Consumers that wrote their own rAF batcher around this can drop it.

  The JSDoc and the "Bring your own loop" guide also state what was undocumented:
  segments and `content` are mutually exclusive at render time.
  <sub>`@aparte/core`</sub>

- [801622a](https://github.com/apartejs/aparte/commit/801622a): Swapping a branch no longer conjures a scroll-to-bottom button on a transcript you are
  already at the bottom of, and no longer drops you away from the bottom while the new version
  renders.

  Two things were wrong. `navigateBranch` turned auto-follow **off** unconditionally so a
  rebuild wouldn't yank a reader who had scrolled up — but doing that to a reader who was at
  the bottom left them behind (a rebuild's height flickers: measured at 1730 → 1934 → 1730px
  on the React wrapper as the swapped-in bubble renders and settles) and, since the button
  mirrored that flag, offered them a scroll to nowhere. It now keeps auto-follow when you were
  at the bottom, and only disables it when you weren't.

  And the button stopped mirroring the flag at all: it asks the geometry ("is anything below
  the fold?") on every scroll and on every post-mutation frame. The flag is intent, the button
  is a fact; mirroring one with the other made it lie whenever they diverged. This was most
  visible in the four wrappers, where the post-swap re-derive never ran (the framework owns the
  DOM, so that code path returned early), but the flag could go stale in raw core too.
  <sub>`@aparte/core`</sub>

- [0d4945f](https://github.com/apartejs/aparte/commit/0d4945f): Two attachment-rendering fixes in the message bubble:

  - **Alignment**: a user message's attachment strip was anchored to the trailing
    edge while the user bubble hugs its text on the leading edge — one message
    split across both sides of the transcript (a chip on the right, the text
    bubble on the left). The strip now shares the bubble's edge.
  - **Standalone `appendMessage()`**: the viewport created the bubble from
    attributes only, silently dropping the message's `attachments`, `segments`
    and `usage`. It now runs the same `populateBubbleFromMessage` sync the
    framework-managed path uses, so an imperatively appended message renders in
    full (bring-your-own-loop consumers were getting text-only bubbles).
  <sub>`@aparte/core`</sub>

- [de57a6a](https://github.com/apartejs/aparte/commit/de57a6a): Fix a pending assistant bubble showing its action bar (copy/retry) and no busy
  state in every framework wrapper. A wrapper creates `<aparte-chat-bubble>` with
  its attributes already set, so `streaming` arrived _before_ the element rendered
  its inner DOM — and `_updateStreaming()` had no `.aparte-message` to write to, so
  `data-streaming`, `aria-busy="true"` and the class that hides the footer were
  silently dropped for the whole turn. The state is now re-applied when the inner
  DOM is built.

  Visible effect: an empty, still-streaming reply no longer offers Copy/Retry, and
  screen readers get `aria-busy` while the answer is being generated.
  <sub>`@aparte/core`</sub>

- [af5ed3d](https://github.com/apartejs/aparte/commit/af5ed3d): `@aparte/core` now declares `sideEffects` (it was the only one of the 14 packages
  without it, so bundlers had to treat every module as side-effectful and could not
  tree-shake it). The browser entry and the CSS are listed as effectful — they define
  the custom elements — and everything else, including the DOM-free Node entry, is
  pure.

  The README gains a **Node / SSR** section: the `node` export condition, what the
  server entry keeps (client, host, transports, `createAparteChatHandler`, runtime,
  types) and what it drops (the custom elements, with `registerAllComponents()` a safe
  no-op). The capability already existed and was invisible — reading `src/index.ts`
  shows the _browser_ entry, which is how a consumer concludes the opposite.
  <sub>`@aparte/core`</sub>

- [2336bc5](https://github.com/apartejs/aparte/commit/2336bc5): A partial `AparteIconProvider` no longer breaks the bubble action bar. `getIcon()`
  always fell back to the built-in SVGs for icons a provider didn't implement, but
  `getIconProvider()` — what the action bar reads, calling each icon directly —
  handed back the registered provider verbatim, so a provider covering only some
  icons threw `icons.retry is not a function`. It now returns a complete set,
  falling back per icon.

  Consequently every key on `AparteIconProvider` is now optional, which is what the
  runtime always supported (and what the interface's own example showed). Full
  providers keep type-checking unchanged; partial ones stop needing `as any`.
  <sub>`@aparte/core`</sub>

- [79b2795](https://github.com/apartejs/aparte/commit/79b2795): Accessibility fixes in `<aparte-select>` (and therefore the model selector), all
  found by axe-core scanning an _open_ dropdown:

  - the `listbox` role moved from the dropdown shell to the options container, so
    the search field is no longer an invalid child of a listbox (critical);
  - the `combobox` trigger now declares the `aria-controls` it is required to have,
    and the listbox carries its own accessible name (critical / serious);
  - `<aparte-optgroup>` names itself with `aria-labelledby` instead of putting
    `aria-label` on its header div, which had turned a generic node into an invalid
    listbox child (critical);
  - the selected option no longer paints white text on the brass accent (≈3.4:1 in
    light, worse in dark). It now uses an accent _tint_ plus an inset accent bar and
    keeps the theme's text colour. `--aparte-select-option-selected` and
    `--aparte-select-option-selected-text` still override both.

  Known remaining gap: collapsing a provider group is pointer-only (the group
  header is not focusable).
  <sub>`@aparte/core`</sub>

- [9f839e4](https://github.com/apartejs/aparte/commit/9f839e4): Fix send routing when several chats share a page. `AparteClient._handleSend`
  resolved the event's `targetId` by requiring `appendMessage` **on** that element,
  but an `<aparte-chat>` shell owns no `appendMessage` — it delegates to its
  `.viewport`. Every `target`-attributed send therefore logged a warning and fell
  through to a DOM scan that returns the _first_ chat on the page, so with two
  chats mounted one chat's reply rendered inside the other. Send now uses the same
  resolver as retry/edit (which had already been fixed for this).
  <sub>`@aparte/core`</sub>

- [80995ea](https://github.com/apartejs/aparte/commit/80995ea): `injectTokenStream` / `streamTokens` now keep the framework's message list in sync. They
  pushed every token to the viewport and told the framework **nothing**: the DOM held the
  reply while React/Vue/Svelte state still had `content: ''`. Anything re-rendering from state
  wiped the visible answer, `getMessages()` lied, persistence saved an empty message — and a
  custom bubble (`renderBubble`, driven by that state) showed nothing at all.

  Same discipline as `appendToSegment`: each token reaches the bubble immediately, the state is
  synced **once per frame**, and a flush is guaranteed before completion, on abort, and before
  any structural change. Both stream channels now fold into a single list update, so a frame
  carrying tokens _and_ segment chunks still costs one render. A stopped stream keeps what was
  already streamed (truncated, not erased), and the sync targets the stream's own message id
  rather than "the last message".
  <sub>`@aparte/core`</sub>

- [118d4fb](https://github.com/apartejs/aparte/commit/118d4fb): Editing a message now updates the bubble that shows it. `AparteChatViewport`
  forwarded an atomic `updateMessage()` to the rendered bubble only when the
  payload carried `status` or `segments`, so an edit — which sends `{ content }` —
  updated the message repo (and therefore the history sent to the model) while the
  transcript kept displaying the old wording. `content`, `attachments` and `usage`
  updates are forwarded too now.

  Standalone/raw-core consumers were affected; framework wrappers re-render bubbles
  from their own state, which masked it.
  <sub>`@aparte/core`</sub>

- [8286e3f](https://github.com/apartejs/aparte/commit/8286e3f): Two provider contracts now say what they actually do.

  `createOpenAICompatProvider` returns `AparteAIProvider & AparteFormatAdapter`. The
  factory has always supplied `buildRequest` / `parseStream` / `authHeaders` /
  `defaultEndpoint`, but the declared type left them optional (right for
  `AparteAIProvider` in general, since a provider may own its I/O through `chat()`) —
  so callers driving the adapter themselves had to add `!` or write a check that
  cannot fail.

  `@aparte/provider-transformers` warns once when it drops `tool_call` / `tool_result`
  turns from the prompt. Tool calling is out of scope for v1, but the turns were
  filtered silently: an app with registered tools got a model that never saw the call
  or its result, with nothing to explain it.
  <sub>`@aparte/provider-openai-compat`, `@aparte/provider-transformers`</sub>

- [bebc201](https://github.com/apartejs/aparte/commit/bebc201): Usage is no longer lost on a turn that ends with a tool call. `parseStream` emitted
  `done` and returned as soon as it saw `finish_reason: 'tool_calls'` — but under
  `include_usage` (which `buildRequest` requests) the usage-only chunk arrives _after_
  the finish chunk, so `done.usage` was `undefined` for every tool-call turn. On a chat
  that goes unnoticed; on an agent it is most turns. The parser now emits the
  `tool_use` events and keeps reading, so the single `done` carries the usage (including
  `cacheReadTokens`).
  <sub>`@aparte/provider-openai-compat`</sub>

- [50d90a8](https://github.com/apartejs/aparte/commit/50d90a8): **The waiting state now exists.** Between "user sends" and the first token there was a bubble
  with a name and an empty body — and, in the display-only path, copy/retry on a reply that
  hadn't happened. The bubble now shows a built-in indicator while it is in flight with nothing
  in it: animated dots (CSS, so no per-token work, themable via `--aparte-waiting-*`, and
  already covered by the reduced-motion rule) plus a screen-reader label taken from
  `locale.typing` — a string that shipped in `DEFAULT_LOCALE` and was read by nothing until now.

  No wiring: it works in raw `<aparte-chat>`, in the four wrappers, and in a hand-rolled loop.
  `<aparte-chat-status>` / `isTyping` stay **your** channel for your own status ("indexing your
  files"), which is why they are not auto-driven.

  New export **`isAwaitingReply(message)`** — the one rule core and all four wrappers now share
  for "is this bubble in flight". Besides `status: 'streaming' | 'pending'`, it also covers an
  **assistant message with no `status` at all and nothing in it**: the empty shell a token stream
  is about to fill. That case used to render as a finished reply, action bar included. Only
  silence is interpreted — an explicit status, `'completed'` on an empty message included, is
  believed.

  If you deliberately append empty assistant bubbles that no stream will fill, give them an
  explicit `status` (e.g. `'completed'`) or they will show the indicator.
  <sub>`@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [73ecd4e](https://github.com/apartejs/aparte/commit/73ecd4e): Fix the `aparte-*` JSX types under **React 19**. The wrapper declared its custom
  elements only in the legacy _global_ `JSX` namespace, which React 19 no longer
  consults (`React.JSX` replaced it) — so any React 19 consumer writing
  `<aparte-composer-input />` (for instance to slot a custom composer) got
  `TS2339: Property 'aparte-composer-input' does not exist on type
'JSX.IntrinsicElements'`, despite the peer range advertising `^18 || ^19`. The
  element list is now declared once and merged into both namespaces, so React 18
  and 19 consumers both see it.

  The blind spot is closed too: the package is developed against `@types/react` 19
  (its own JSX would fail to compile without the augmentation), and the React
  playground's typecheck — now part of the gate — covers the consumer-side case.
  <sub>`@aparte/react`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/provider-ai-sdk`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/locale-fr`.</sub>

## 0.3.0-alpha.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [d4c448b](https://github.com/apartejs/aparte/commit/d4c448b): New `fileInjectFilter` on `AparteClientOptions`: a per-file veto on top of the
  `rawFileInject` mode. Called for each attached file the mode would inline into
  the request; return `false` to keep it out (the file still rides on the
  `aparte-send` event for the application layer). Lets a host keep the default
  inline UX while blocking sensitive names (`.env`, keys, certs).
  <sub>`@aparte/core`</sub>

- [7227dee](https://github.com/apartejs/aparte/commit/7227dee): New `AparteConfig.resetLocale()`: restores the built-in English locale after a
  `setLocale(...)` call, without having to import `DEFAULT_LOCALE` yourself.
  Notifies mounted components like every other live setter.
  <sub>`@aparte/core`</sub>

- [7227dee](https://github.com/apartejs/aparte/commit/7227dee): `AparteAIProvider.getModels()` is now typed **synchronous-only** (`AparteAIModel[]`).
  The `Promise<AparteAIModel[]>` form was silently ignored by `getCurrentModel()`: an
  async provider lost its capability list (e.g. `function_calling`), which disabled
  tools with no error or warning. Async model fetching belongs in `fetchModels()`
  (consumed by `AparteConfig.refreshProviderModels()` and the model-selector).
  Plain-JS consumers that still return a Promise now get an explicit `console.warn`
  instead of a silent failure. All bundled providers already complied.
  <sub>`@aparte/core`</sub>

### Patch Changes

- [0192d63](https://github.com/apartejs/aparte/commit/0192d63): `injectTokenStream` / `stopTokenStream` now carry real JSDoc on the canonical
  `AparteChatImperativeApi` (shipped in the `.d.ts`, so it surfaces in every
  wrapper): the viewport auto-creates a missing assistant message internally
  only, so wrappers should `appendMessage` explicitly before injecting. A new
  "Bring your own loop" docs guide covers the display-only mode end to end.
  <sub>`@aparte/core`</sub>

- [622dc78](https://github.com/apartejs/aparte/commit/622dc78): `<aparte-select>`'s combobox trigger now carries an accessible name (axe
  `aria-input-field-name`, serious): the host's `aria-label` when provided,
  falling back to the `placeholder`. Screen readers previously announced the
  model selector as an unnamed combobox.
  <sub>`@aparte/core`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.2.0-alpha.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [930a108](https://github.com/apartejs/aparte/commit/930a108): Harden the server-side `createAparteChatHandler`: add an optional `authorize(req)` gate
  that runs before any work (return `false` for a 401, a `Response` for a custom rejection,
  or `true` to proceed) so you can put auth in front of the key-spending `/api/chat` route,
  and guard the vendor URL build against an adapter returning a non-rooted request path
  (SSRF) by rejecting anything that isn't a single-rooted path.
  <sub>`@aparte/core`</sub>

- [4aac26d](https://github.com/apartejs/aparte/commit/4aac26d): Add the `<aparte-chat>` shell — the container element for a chat. Wrap a viewport
  and a composer in it and it lays them out as a flex column; leave it empty and it
  fills in a default composition:

  ```html
  <!-- default composition -->
  <aparte-chat
    center-empty
    placeholder="Say something…"
    style="height: 600px"
  ></aparte-chat>

  <!-- or your own primitives inside, still laid out + center-empty -->
  <aparte-chat center-empty>
    <aparte-chat-viewport></aparte-chat-viewport>
    <aparte-composer>…</aparte-composer>
  </aparte-chat>
  ```

  Being a component, it owns behaviour a wrapper `<div>` can't: with the opt-in
  `center-empty` attribute it watches its own viewport and keeps the composer
  centered as a welcome state until the first message, then slides to the normal
  layout — no external JavaScript. Presentational only (no transport wiring);
  `placeholder` / `disabled` forward to the composer, and `.viewport` / `.composer`
  getters expose the composed elements.
  <sub>`@aparte/core`</sub>

- [a2ed74b](https://github.com/apartejs/aparte/commit/a2ed74b): Ship clean inline-SVG default icons (copy, retry, edit, send, thumbs up/down, and
  the rest) in `DEFAULT_ICON_FALLBACKS`, so the chat looks right out of the box with
  no icon plugin — still zero runtime dependencies, since an inline SVG is just a
  string. Override any icon via `setIconProvider` with any HTML (SVG, an icon-font
  `<i>`, an emoji or an `<img>` — the value is treated as trusted markup).
  <sub>`@aparte/core`</sub>

- [a6ed936](https://github.com/apartejs/aparte/commit/a6ed936): One canonical imperative contract for `<AparteChat>` across the four wrappers.

  `@aparte/core` now exports `AparteChatImperativeApi` — the ~20-method surface every
  framework handle delegates to `AparteChatHost`. React's `AparteChatHandle` and
  Vue/Svelte's `AparteChatInstance` are now type aliases of it, and the Angular
  component `implements` it, so any per-wrapper drift (a missing or mistyped method)
  is a **compile error** instead of a silent divergence.

  **Angular parity:** adds the imperative `setConversationId(id)` method (the
  `conversationId` `@Input` remains the declarative path), closing the one gap where
  Angular's handle differed from the other three.
  <sub>`@aparte/core`, `@aparte/angular`</sub>

- [7157ad5](https://github.com/apartejs/aparte/commit/7157ad5): Unify every custom DOM event to one kebab-case convention and type it.

  The public event surface used three conventions — kebab (`aparte-send`), colon
  (`aparte:retry`, `aparte:action`, `aparte:artifact-*`, …) and separatorless
  (`apartemessagestart`/`done`/`error`/`aborted`). They are now **all kebab-case**:

  - `aparte:*` → `aparte-*` (e.g. `aparte:retry` → `aparte-retry`, `aparte:action`
    → `aparte-action`, `aparte:tool-decision` → `aparte-tool-decision`).
  - `apartemessagestart|done|error|aborted` → `aparte-message-start|done|error|aborted`.
  - Already-kebab events (`aparte-send`, `aparte-select-*`, `aparte-model-change`, …)
    are unchanged.

  Kebab is the only convention every framework can bind in a template — Angular
  parses a `:` in an event name as a `target:event` selector, so colon events could
  never be `(aparte:x)`-bound there.

  **New:** an `HTMLElementEventMap` augmentation ships with `@aparte/core`, so
  `element.addEventListener('aparte-retry', e => e.detail)` gives a typed `e.detail`
  (no more `(e as CustomEvent<…>).detail` cast) for the public bubble / lifecycle /
  artifact / tool events.

  **Breaking:** any consumer listening on the old colon or separatorless names must
  rename to kebab. Pre-1.0, so shipped as minor.
  <sub>`@aparte/core`, `@aparte/plugin-model-selector`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [69525ad](https://github.com/apartejs/aparte/commit/69525ad): Zero-dependency web components for AI chat: bubble, composer, viewport,
  conversation list, and elicitation, with a transport seam (`DirectTransport` /
  `BackendTransport`) and a customization surface (render hooks, action registry,
  theming via CSS custom properties). Ships ESM plus a Node/SSR-safe entry and a
  custom-elements manifest.
  <sub>`@aparte/core`</sub>

- [d31f681](https://github.com/apartejs/aparte/commit/d31f681): Give the base chat container layout to both host shapes core already recognises,
  from one rule. Core resolves the chat host via the selector
  `aparte-chat, [data-aparte-chat]` (the vanilla `<aparte-chat>` element and the
  `<div data-aparte-chat>` roots the framework wrappers render); the base
  flex-column layout (fill the parent, viewport scrolls internally, composer pinned
  to the bottom) now keys on that same selector in `aparte.css`. This fixes React,
  whose wrapper container previously had no base layout, and lets the Vue and Svelte
  wrappers drop their scoped component CSS — every wrapper gets consistent layout
  from the one stylesheet consumers already import, with no wrapper-specific class.
  <sub>`@aparte/core`</sub>

- [e69435f](https://github.com/apartejs/aparte/commit/e69435f): Make the `<aparte-chat>` shell framework-safe: it no longer injects its default
  viewport + composer when the element carries `framework-managed`. A framework
  wrapper whose component selector is `aparte-chat` (the Angular one) has its host
  upgraded by core, and its children only render _after_ `connectedCallback` — so
  the existing "author-provided composition wins" check cannot see them, and the
  default composition was being injected underneath the wrapper's own. Reuses the
  same `framework-managed` signal `<aparte-chat-viewport>` already takes.
  <sub>`@aparte/core`</sub>

- [bfa9901](https://github.com/apartejs/aparte/commit/bfa9901): Theme every part of the chat from CSS. The message surface is now a
  `.aparte-message-content` region (attachments sit above it as a sibling, the
  avatar is opt-in — empty by default), and every theme value flows through a CSS
  custom property: colour, spacing, font size / weight / line-height, control
  sizes, radii and border widths. No hardcoded theme literals remain — only
  structural geometry (`100%`, `50%` radii, the spinner stroke). New scales:
  `--aparte-space-*`, `--aparte-font-size-*`, `--aparte-font-weight-*`,
  `--aparte-line-height-*`.

  BREAKING: the `--aparte-bubble-*` theme variables are renamed to
  `--aparte-message-content-*`.
  <sub>`@aparte/core`</sub>

- [554e4e9](https://github.com/apartejs/aparte/commit/554e4e9): **Remove the deprecated `<aparte-chat-input>` element** (`AparteChatInput`). It was the legacy
  monolithic composer — 653 lines of `innerHTML`-heavy code that auto-registered on import into
  the zero-dep core, was untested, and predated the modern `<aparte-composer>` + `<aparte-chat>`
  composition. It is no longer exported, registered, or styled; the elicitation panel and the
  client's target resolution already preferred `<aparte-composer>` and simply drop the legacy
  fallback. Reclaims bundle size and removes an untested surface from core.

  **Breaking** (pre-1.0, shipped minor): consumers still on `<aparte-chat-input>` should move to
  `<aparte-chat>` (or `<aparte-composer>` directly). The `AparteInputConfig` type stays.
  <sub>`@aparte/core`</sub>

- [f8a6dd7](https://github.com/apartejs/aparte/commit/f8a6dd7): De-duplicate the wrappers' `AparteUi` prop-applier. The four wrappers each
  carried a byte-identical vanilla-DOM prop applier + event list; they're now in
  `@aparte/core` as `applyElementProps(el, props, transformValue?)` and
  `DEFAULT_UI_EVENTS`. Vue passes `toRaw` as the transform to unwrap its reactive
  proxy. No public wrapper API change.
  <sub>`@aparte/core`</sub>

- [d60e2c8](https://github.com/apartejs/aparte/commit/d60e2c8): Type the request `_meta` channel. `AparteChatRequest._meta` is now
  `AparteRequestMeta` instead of `Record<string, unknown>`: the five well-known
  keys (`pipeline`, `prefixSegments`, `artifactHint`, `artifactRaw`, `artifactXml`)
  are typed and documented, while an open index signature keeps it a channel for
  consumer-specific context. New exported types: `AparteRequestMeta`,
  `ApartePipelinePhase`, `AparteArtifactHint`.
  <sub>`@aparte/core`</sub>

- [e8d9b32](https://github.com/apartejs/aparte/commit/e8d9b32): Unify custom action registration into one zoned API.

  A single `registerAction(action)` now places a button via
  `zones: ('composer' | 'bubble')[]`, with per-zone options
  (`composer: { position, hidden }`, `bubble: { roles }`). Every action emits the
  declarative `aparte-action` event (now carrying `zone`), with an optional
  `onClick` callback fired alongside for convenience.

  **Breaking:** `registerBubbleAction`, `getRegisteredBubbleActions` and
  `unregisterBubbleAction` are removed, and the `AparteBubbleAction` type is merged
  into `AparteAction` (use `zones: ['bubble']` + `bubble.roles`). `getActions(zone)`
  now requires a zone argument.
  <sub>`@aparte/core`</sub>

- [1573645](https://github.com/apartejs/aparte/commit/1573645): One imperative API across the four wrappers:

  - `injectTokenStream` now takes the cross-wrapper `AsyncIterable<string>` contract on Angular
    too (the RxJS `Observable<string>` shape still works — it's a union).
  - Angular `provideAparte()` auto-connects the client on app init (`autoConnect: false` to opt
    out); no more manual `AparteAiService.connect()` in components. `connect()` stays as the
    idempotent escape hatch.
  - The viewport accessor is `getViewport(): HTMLElement | null` everywhere. **Breaking**: it
    replaces React's `handle.viewport` property and Vue's exposed `viewport` ref.
  - The Vue/Svelte `AparteChatInstance` interfaces now include the full imperative surface
    (`scrollToBottom`, `focusInput`, `getViewport`).
  - `AparteUiHandle` (and `AparteUiProps` where idiomatic) exported from every barrel, not just
    React's.
  <sub>`@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

### Patch Changes

- [6ab5682](https://github.com/apartejs/aparte/commit/6ab5682): Round-3 audit follow-ups (bounded fixes):

  - **Cross-wrapper parity is now compile-enforced on all four wrappers** (was only React +
    Angular): Vue's `defineExpose` uses `satisfies AparteChatImperativeApi`, Svelte adds a
    type-checked parity factory. A dropped/mistyped method is now a build error in every
    wrapper — and the `AparteChatImperativeApi` JSDoc no longer overstates the guarantee.
  - **core**: `AparteConfig.unregisterAIProvider` now `_notify()`s (a mounted model-selector
    drops the removed provider instead of showing a stale list); `<aparte-select>` resolves its
    selected label by iterating options instead of an interpolated attribute selector (a model
    id containing `"`/`]` no longer throws `SyntaxError`).
  - **docs/JSDoc hygiene**: removed three shipped references to non-existent
    `@aparte/plugin-{skeleton,icons}-default` packages; fixed the `useAparteChat` `@example` that
    re-appended the user message (double-append); the three AI-provider READMEs now call
    `@aparte/core` a required **peer dependency** (it's a runtime import), not an "optional peer".
  <sub>`@aparte/core`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [4065fd6](https://github.com/apartejs/aparte/commit/4065fd6): Bound the binary-artifact preview cache. `_binaryArtifactCache` held full file buffers
  (pdf/xlsx/docx) keyed by segment id and was never evicted, so a long session generating
  many binary artifacts grew memory for the page's lifetime. It's now capped (LRU-ish: cap
  24, oldest evicted on insert, re-insert refreshes recency).
  <sub>`@aparte/core`</sub>

- [307039b](https://github.com/apartejs/aparte/commit/307039b): Fix a small memory leak in the segment renderers: two internal per-segment throttle
  maps (syntax-highlight and artifact-dispatch debouncing) grew one entry per streamed
  segment for the page's lifetime. They're now bounded and evict oldest like the
  neighbouring binary-artifact cache, so long-running sessions no longer accumulate them.
  <sub>`@aparte/core`</sub>

- [333d301](https://github.com/apartejs/aparte/commit/333d301): Tighten the client's typing: the four near-identical local target interfaces
  (`AparteChatElement`/`RetryTarget`/`EditTarget`/`CompactTarget`) are consolidated into the
  one module-level `AparteChatTargetElement`, which removes ~two dozen gratuitous
  `(target as any).method` casts; the three `catch (err: any)` become `catch (err: unknown)`
  with narrowing; and `(segment as any).content` reads become a typed `{ content?: string }`
  cast. No behaviour change — pure typing rigor (the `as any`s were papering over methods the
  element already declares). Drops the repo's `no-explicit-any` warning count from ~63 to ~39.
  <sub>`@aparte/core`</sub>

- [14f1f1d](https://github.com/apartejs/aparte/commit/14f1f1d): Collapse the triplicated send / retry / edit tail into one `_streamTurn` helper.

  `_handleSend`, `_handleRetry` and `_handleEdit` each re-implemented the same
  provider → tools → request-interceptor → `toolChoice:'none'` strip → reset-abort →
  `aparte-message-start` → `_streamLoop` → `aparte-message-done` / lifecycle-error
  sequence. They now share one private method, so that flow can't drift between the
  three entry points. As part of it, `_handleSend` uses the shared `_resolveAuth`
  helper and resets the abort flag before streaming — the two divergences the audit
  flagged (a documented past drift). No behavior change on the happy path (verified:
  867 unit incl. the retry/edit suites + parity, and 27/27 browser E2E).
  <sub>`@aparte/core`</sub>

- [18d2065](https://github.com/apartejs/aparte/commit/18d2065): Enforce lint at zero warnings (`eslint . --max-warnings 0`) and clear the 37
  `no-explicit-any` backlog — each replaced with a precise type or, where DOM /
  custom-element interop genuinely requires it, a structural `unknown` cast (no blanket
  `any` disables). A few public types are tightened from `any` to a precise type or
  `unknown` (e.g. `AparteCustomSegment.data`, `AparteError` context) — a type-safety
  improvement with no runtime change.
  <sub>`@aparte/core`</sub>

- [6d6123e](https://github.com/apartejs/aparte/commit/6d6123e): Fix an XSS sink: the chat bubble's public `name` attribute was interpolated raw into
  `innerHTML` on initial render, while every sibling field (attachment names, etc.) was
  escaped. An app that binds an untrusted author/persona name into `name` would ship a
  script injection. Escaped it, consistent with the other fields, + a regression test.
  <sub>`@aparte/core`</sub>

- [97bd6c5](https://github.com/apartejs/aparte/commit/97bd6c5): Escape three more consumer/stream-supplied fields that reached innerHTML unescaped: the
  composer action `label` and input `placeholder` (attribute positions) and a `message-id`
  CSS attribute-selector in the viewport (now `cssEscape`d like its siblings). Harden the
  bubble / conversation-list / attachment escape helpers to also escape `'`. Add a
  best-effort `.catch` to the fire-and-forget syntax-highlight and clipboard promises so a
  rejecting highlighter or clipboard write degrades silently instead of an unhandled rejection.
  <sub>`@aparte/core`</sub>

- [8417976](https://github.com/apartejs/aparte/commit/8417976): Harden the internal `[data-segment-id]` / `[message-id]` attribute-selector lookups in
  the bubble and viewport against a hostile, stream-supplied id: interpolated ids are now
  escaped for the quoted-attribute context (via a small `cssEscape` helper that needs no
  `CSS` global, so it also works in SSR/test runtimes). An id containing `"` (e.g. a
  provider-supplied tool-call id) can no longer throw a `SyntaxError` that drops a render
  update, nor form a selector list that mis-targets another element. Ids are random UUIDs
  by default, so this is defense-in-depth.
  <sub>`@aparte/core`</sub>

- [1f6c43e](https://github.com/apartejs/aparte/commit/1f6c43e): Escape the `thinking` segment's `label` before it reaches `innerHTML` (the adjacent
  `content` was already escaped). Built-in callers always pass a hardcoded label, but a
  host rendering a model-derived label into a thinking segment would otherwise have a
  stored-XSS sink — closed defensively, consistent with the other renderer escapes.
  <sub>`@aparte/core`</sub>

- [2efef6f](https://github.com/apartejs/aparte/commit/2efef6f): Extract `_streamLoop`'s ~190-line `tool_use` case into a `_handleToolUseEvent` helper
  (built-in `create_artifact`, per-tool renderer, the human-in-the-loop approval gate, and
  the handler run with its timeout/abort). The loop now delegates and reads the
  continue/stop signal back. Behaviour-preserving — proven by the engine parity golden-master
  that drives the real `_streamLoop`, plus the client tool/HITL suites (869 tests, 27/27 e2e).
  <sub>`@aparte/core`</sub>

- [0aefd9b](https://github.com/apartejs/aparte/commit/0aefd9b): Robustness fixes surfaced by the code audit:

  - **core `AparteConfig`** — `_notify` isolates each subscriber in try/catch (one throwing
    listener no longer aborts the loop and starves the others); `setLocale`/`extendLocale`/
    `setAvatarProvider` now notify subscribers like every other live setter, so a runtime
    locale/avatar swap propagates to already-mounted components; `refreshProviderModels` is
    typed `Promise<AparteAIModel[]>` instead of `Promise<any[]>`.
  - **engine** — a tool handler is no longer invoked when the run's `AbortSignal` was already
    aborted before the call (a past `abort` event never re-fires on the fresh listener).
  - **provider-openai-compat** — malformed tool-call arguments JSON at
    `finish_reason: 'tool_calls'` and unparseable SSE data lines now log a breadcrumb instead
    of being dropped silently.
  <sub>`@aparte/core`, `@aparte/engine`, `@aparte/provider-openai-compat`</sub>

- [0aefd9b](https://github.com/apartejs/aparte/commit/0aefd9b): Escape untrusted model output before it reaches `innerHTML` (two DOM-XSS paths):

  - **core** — the code-segment `language` (the ` ```lang ` fence tag, LLM-authored and
    prompt-injectable) is now HTML-escaped in both the label text and the
    `class="language-…"` attribute; the file-tree node `status` too.
  - **core primitives** — `<aparte-select>` and `<aparte-optgroup>` build their labels via
    `textContent`, not `innerHTML`, matching their own update paths.
  - **plugin-model-selector** — remote model names/ids and provider labels are escaped before
    the option list is (re)built.

  Reachable from a hostile/aggregating `/models` endpoint or a prompt-injected code fence.
  <sub>`@aparte/core`, `@aparte/plugin-model-selector`</sub>

- [9568c6b](https://github.com/apartejs/aparte/commit/9568c6b): Escape `data-segment-id` in every segment renderer. A segment id can embed an untrusted
  tool-call id (`tool-${toolCallId}`, taken verbatim from the endpoint's SSE `tool_calls[].id`),
  so the tool-call renderer — and, defense-in-depth, all other renderers plus the ask-question
  receipt — now HTML-escape it before it reaches `innerHTML`. Closes a DOM-XSS reachable from a
  hostile OpenAI-compatible endpoint (the same class as the code-fence `language` fix, in a
  sibling sink). Regression test added.
  <sub>`@aparte/core`, `@aparte/plugin-ask-user`</sub>

- [7e5cfb7](https://github.com/apartejs/aparte/commit/7e5cfb7): Teardown + sanitizer hardening from the audit:

  - **core `AparteChatHost.streamTokens`** now races each `next()` against the abort signal and
    calls `iterator.return()` on abort. An idle token source (notably the Angular
    Observable→AsyncIterable adapter parked on a pending `next()`) previously left the loop and the
    underlying subscription alive after `stopTokenStream()`; it now unwinds and cleans up promptly.
    Fixes the zombie-subscription leak for every wrapper. Regression test added.
  - **`@aparte/angular`** `AparteChatComponent` now unsubscribes its `bubbleRefs.changes`
    subscription in `ngOnDestroy` (previously leaked one live subscription per mount across SPA
    route churn).
  - **core sanitizer** drops the legacy `name` attribute from `<a>` — obsolete and a DOM-clobbering
    vector (`id`/`style` kept: they carry legitimate aria/anchor/highlight uses; a property-level
    `style` allowlist is a separate pass).
  <sub>`@aparte/core`, `@aparte/angular`</sub>

- [75af64a](https://github.com/apartejs/aparte/commit/75af64a): Fix two browser-only defects surfaced by the new cross-framework browser E2E
  suite (both passed the jsdom unit tests):

  - **Standalone send, retry and edit now resolve the viewport.** In the
    documented flat layout (`<aparte-chat>` wrapping `<aparte-chat-viewport>`), the
    client matched the shell first and — finding no `appendMessage` on it —
    silently dropped the reply (send) or no-op'd (retry/edit). A shared resolver
    now scans candidates for the one that can actually render, following the
    shell's delegation to its viewport, so a bare-shell chat streams, regenerates
    and edits out of the box.
  - **The model-gate style applies to every host.** The `data-model-gated` opacity
    rule had been mis-scoped (a comment split the selector list), leaving the
    vanilla composer permanently dimmed and greying only a `[data-aparte-chat]`
    direct child when gated. It is now an unscoped `aparte-composer[data-model-gated]`
    rule that dims any gated composer, in every wrapper and the vanilla shell.
  <sub>`@aparte/core`</sub>

- [fa5a3f8](https://github.com/apartejs/aparte/commit/fa5a3f8): Message editing now reuses the composer's contenteditable input instead of a bespoke
  `<textarea>`, so editing a message is iso with composing one:

  - Same input primitive (`<aparte-composer-input>`): autosize, IME handling, paste, placeholder
    and styling are shared. The edit box is styled like the composer shell.
  - **`Enter` saves, `Shift+Enter` inserts a newline** (was `Ctrl/Cmd+Enter`); `Esc` still cancels.
  - The save/cancel icons route through the icon provider (`getIcon('check')` / `getIcon('close')`),
    so `setIconProvider` overrides them too; their colours stay themable via `--aparte-success` /
    `--aparte-error`.

  `<aparte-composer-input>` is now usable standalone: with no `<aparte-composer>` parent it emits a
  bubbling `aparte-composer-submit` event on submit instead of no-op-ing, and gains a `focusEnd()`
  method (focus with the caret at the end of the content). Its contenteditable also handles newlines
  robustly now — `Shift+Enter` inserts a single deletable `<br>` (no `<div>` wrappers), an empty
  field can't start with a blank line, and `getValue()` preserves newlines (`<br>` → `\n`).

  The `aparte-edit` event contract is unchanged.

  Also fixes `<aparte-chat center-empty>`: the empty/welcome state centers again. The viewport's
  standalone `height: 100%` (for the scroll chain) was defeating `flex-grow: 0`, so the composer
  couldn't center; it's released only while empty.
  <sub>`@aparte/core`</sub>

- [8a3890b](https://github.com/apartejs/aparte/commit/8a3890b): Isolate streaming state between multiple chats on one page. Lifecycle events
  (`aparte-message-start` / `done` / `error` / `aborted`) and `aparte-abort` now
  carry the target host's `targetId`, and a composer only reacts to its own host's
  turn. Before this, streaming in one chat flipped every composer to the "Stop"
  state, a `done` in one reset the others (hiding an active elicitation panel), and
  cancelling one aborted every scoped client. Id-less single-instance pages still
  broadcast unchanged.
  <sub>`@aparte/core`</sub>

- [49f4d70](https://github.com/apartejs/aparte/commit/49f4d70): Robustness hardening: bound the file-generation handler map so a generation that never
  terminates (e.g. the conversation is cleared mid-flight) can no longer leak its window
  listeners for the page's lifetime; add a compile-time exhaustiveness guard on the
  stream-event switch so a new event variant fails the typecheck instead of being silently
  ignored; and mark every intentional fire-and-forget promise in the streaming / render
  paths explicitly (type-aware lint now guards against unhandled rejections).
  <sub>`@aparte/core`</sub>

- [fcff831](https://github.com/apartejs/aparte/commit/fcff831): Re-export the `AparteSystemPromptVarsProvider` type from the package root (both
  the browser and Node entries) so consumers can type the argument of the public
  `AparteConfig.setSystemPromptVarsProvider()` without reaching into a deep import.
  <sub>`@aparte/core`</sub>

- [455fc81](https://github.com/apartejs/aparte/commit/455fc81): Branch + shell fixes:

  - **Message tree:** `MessageRepository._relink` no longer corrupts the old parent's
    active branch when the moved node was that parent's active child (it walked
    `findHead` into the subtree being moved and left a dangling pointer). Only reached
    on re-parenting the active child; retry/edit flows were unaffected.
  - **`<aparte-chat>` shell scroll:** the shell now sets `height: 100%` so the inner
    scroll container has a definite height to resolve against. Inside a flex column with
    no definite ancestor height the container grew with content and nothing scrolled
    (messages/action-bars spilled below the view). Give the shell — or a parent — a
    definite height and it scrolls internally; the styled scrollbar, wheel, auto-scroll
    and scroll button stay wired to the same inner container. The scroll-to-bottom button
    is also re-derived from real geometry after a path re-render (a branch swap rebuilds
    the DOM with no `scroll` event, so it could otherwise stay stale).
  <sub>`@aparte/core`</sub>

- [6a50004](https://github.com/apartejs/aparte/commit/6a50004): Harden the default sanitizer's residual defense-in-depth gaps:

  - **Inline `style` is now a property allowlist** (colours, weights, decoration — what
    highlighters emit) instead of a scheme blocklist. Layout/positioning properties
    (`position`/`z-index`/`inset`/`width`/…) are dropped, so hostile markup can no longer build
    a full-viewport click-jacking overlay, and `url()` beacons are rejected on any property.
    Safe declarations survive even when a dangerous one sits beside them (previously the whole
    attribute was dropped all-or-nothing).
  - **`id`/`name` are no longer allowlisted** — they enable DOM clobbering and LLM-authored
    markup has no legitimate need for author-controlled ids.
  - The js-artifact preview's `</script>` escaper now matches `</script` followed by any
    spec terminator (whitespace/`/`/`>`), not only the exact `</script>` (still inside the
    sandboxed, `allow-scripts`-without-`allow-same-origin` iframe).
  <sub>`@aparte/core`</sub>

- [9ce7978](https://github.com/apartejs/aparte/commit/9ce7978): Fix a server-side-rendering crash on the framework wrappers. The Node/SSR entry
  (resolved via the `node` export condition) was missing `applyElementProps` and
  `DEFAULT_UI_EVENTS` — two DOM-free interop helpers that every wrapper's `AparteUi`
  imports as **values**. Because each wrapper barrel re-exports `AparteUi`, importing
  anything (even just `AparteChat`) from `@aparte/react` / `@aparte/vue` /
  `@aparte/svelte` / `@aparte/angular` under SSR (Next.js, Nuxt, SvelteKit, Angular
  Universal) crashed the whole barrel with `does not provide an export named
'applyElementProps'`.

  The Node/SSR entry now mirrors the browser barrel's full non-DOM surface — also
  exposing `DirectTransport`, `BackendTransport`, `isFormatAdapter`,
  `parseAparteEventStream`, and the render-hook / transport / tool-resolver types that
  were only on the browser entry — and a new parity test enumerates that surface so the
  two barrels can never silently drift again.
  <sub>`@aparte/core`</sub>

- [e96920a](https://github.com/apartejs/aparte/commit/e96920a): Type `aparte-composer-change` in the `HTMLElementEventMap` augmentation, so
  `el.addEventListener('aparte-composer-change', e => e.detail)` is typed like the other public
  events (it's in `DEFAULT_UI_EVENTS`, so the wrappers already forward it). Closes the gap where
  a forwarded, typed event was missing from the event map.
  <sub>`@aparte/core`</sub>

- [71c9167](https://github.com/apartejs/aparte/commit/71c9167): Packaging fixes surfaced by wiring `publint` + `are-the-types-wrong` into CI:

  - `@aparte/engine`: its emitted `.d.ts` re-exported submodules without `.js`
    extensions, so `node16` / `nodenext` consumers got unresolved types (bundlers
    hid it). Added the extensions — the types now resolve under every module mode.
  - `@aparte/plugin-ask-question`: declared `"sideEffects": true`. Importing the
    package registers `<aparte-ask-question>` as an import-time side effect, which
    a tree-shaking bundler could otherwise legally drop.
  <sub>`@aparte/engine`, `@aparte/plugin-ask-user`</sub>

- [f2d75b0](https://github.com/apartejs/aparte/commit/f2d75b0): Fix four teardown/cancellation bugs: the model selector could permanently lock itself out
  of re-rendering if its render threw (now `try/finally`); the Angular Observable to
  async-iterator adapter could hang forever if torn down mid-`await` (its `return()` now
  settles the pending read); and the OpenAI-compat and AI-SDK providers now `cancel()` the
  underlying stream on consumer cancel instead of draining the vendor body to the end (AI-SDK
  also can no longer process a second terminal event).
  <sub>`@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/plugin-model-selector`, `@aparte/angular`</sub>

- [aff7e98](https://github.com/apartejs/aparte/commit/aff7e98): Cancelling a local-model stream now actually STOPS generation: the worker runs each generate
  under an `InterruptableStoppingCriteria` and the stream's `cancel()` interrupts it, instead of
  letting the model run to `max_new_tokens` off-thread after the consumer aborted.
  <sub>`@aparte/provider-transformers`</sub>

- [056dafd](https://github.com/apartejs/aparte/commit/056dafd): Raise the monorepo TypeScript strictness floor: `noUncheckedIndexedAccess` and
  `noUnusedParameters` move into `tsconfig.base.json`, so every package inherits them (core /
  engine / providers already opted in locally; plugins / wrappers / locales now do too). The
  new floor surfaced — and this fixes — real unchecked index accesses in `model-selector`
  (auto-select + single-provider option list) and `ask-question` (single-question path):
  each now guards the array element instead of assuming it exists.
  <sub>`@aparte/plugin-ask-user`, `@aparte/plugin-model-selector`</sub>

- [0aefd9b](https://github.com/apartejs/aparte/commit/0aefd9b): README quick-start no longer re-adds the user message in the `messageSent`/`onSend` handler:
  the chat appends it automatically on send, so the previous example rendered every sent message
  twice (Angular: discarded the optimistic message via a `[messages]` round-trip). Now aligned
  with the wrapper JSDoc and the tested playgrounds.
  <sub>`@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [f8a6dd7](https://github.com/apartejs/aparte/commit/f8a6dd7): De-duplicate the wrappers' `AparteUi` prop-applier. The four wrappers each
  carried a byte-identical vanilla-DOM prop applier + event list; they're now in
  `@aparte/core` as `applyElementProps(el, props, transformValue?)` and
  `DEFAULT_UI_EVENTS`. Vue passes `toRaw` as the transform to unwrap its reactive
  proxy. No public wrapper API change.
  <sub>`@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [a6ed936](https://github.com/apartejs/aparte/commit/a6ed936): One canonical imperative contract for `<AparteChat>` across the four wrappers.

  `@aparte/core` now exports `AparteChatImperativeApi` — the ~20-method surface every
  framework handle delegates to `AparteChatHost`. React's `AparteChatHandle` and
  Vue/Svelte's `AparteChatInstance` are now type aliases of it, and the Angular
  component `implements` it, so any per-wrapper drift (a missing or mistyped method)
  is a **compile error** instead of a silent divergence.

  **Angular parity:** adds the imperative `setConversationId(id)` method (the
  `conversationId` `@Input` remains the declarative path), closing the one gap where
  Angular's handle differed from the other three.
  <sub>`@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/plugin-marked`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/locale-fr`.</sub>
