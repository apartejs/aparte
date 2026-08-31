# @aparte/core

## 0.16.7

### Patch Changes

- 42a9d09: `AparteClient` echoes the user's message by default — and echo ownership is a handshake, so nothing doubles.

  The optimistic user bubble used to be every raw-core host's job: everyone wrote the
  same `aparte-send` handler, and whoever forgot shipped a chat where the person cannot
  see what they typed — it compiles, it streams, and nothing errors. Three consumers hit
  exactly that.

  Whoever appends the user message marks the event (`detail.echoed`), and whoever sees
  the mark yields: the `ConversationController` (capture phase, so always first) marks
  for the wrappers' pairing with a raw client, and the client marks after its own echo,
  so even two clients on one page render the message once. Attached files ride the
  echoed bubble as attachments; the wire cannot double — the history builder already
  excludes trailing unanswered user messages. A raw-core host that still appends its own
  bubble should drop that handler, or pass `echoUserMessage: false` to keep ownership.

- 9df0877: Every package names its documentation page (`homepage`) — nothing in the code changes.

  npm shows the link first on each package page; none of the twenty had one. Each now
  points at its own docs page, verified live before it was written.

- b5891b9: The chat follows the system color scheme by default; `data-aparte-theme` now forces either way — `"light"` is new.

  Dark existed only behind `data-aparte-theme="dark"`: on a dark OS, an un-attributed
  chat rendered light on the host's dark page — unreadable, with no error. Measured by
  a consumer building from the docs alone. With no attribute, `prefers-color-scheme`
  now decides; `"dark"` still forces dark; `"light"` (new) forces light, which is the
  veto a light-always page needs and the escape a themed island inside an opposite
  page uses. If your app already flips the attribute from its own toggle, nothing
  changes — the attribute beats the OS in both directions. The dark palette exists
  twice in the sheet (a media query and an attribute selector cannot share a block);
  `check:derived-vars` now holds the copies byte-identical, and holds the light veto to
  the `:root` literals, so the duplicates cannot drift.

- Updated dependencies [9df0877]
  - @aparte/engine@0.16.7

## 0.16.6

### Patch Changes

- cc303dc: An elicitation's question no longer runs under the corner "Skip" button (#50).

  The button is absolutely positioned, so nothing in the flow reserved its width: any
  message long enough to reach the panel's edge printed its first line underneath it —
  measured at 43px of text under "Skip" in a 460px panel. `.aparte-elic-message` now
  keeps the same room the tab rail already reserves, from the same token
  (`--aparte-elic-dismiss-room`), so the two can never disagree — and a locale whose
  word is wider than "Skip" bumps one value instead of patching two rules.

- e8043ba: npm keywords carry the words people actually type — nothing in the code changes.

  Core goes from 5 keywords to 19 (chat-ui, ai-chat, chatbot, chat-component,
  custom-elements, framework-agnostic, the four framework names, agent, tool-calling,
  human-in-the-loop, openai); each wrapper gains chat-ui and ai-chat. Measured against
  the category's incumbents: none of ours were the terms a search starts from.

- 1f7365f: Presence setters treat `''` as ON, so Svelte templates actually set the attribute (#62).

  The attribute types document `''` as the spelling for a presence attribute, because
  React and Vue stringify what they set on a custom element. Svelte 5 takes the property
  path instead whenever the element has an accessor — and `single={''}` on
  `<aparte-split>` (likewise `collapsed`, `disabled`, and the sidebar's `collapsed`)
  handed the setter an empty string that `toggleAttribute` read as falsy: the attribute
  was removed, the opposite of what the template asked for, silently. On a presence
  property an empty string now means ON, exactly as an empty attribute does; `false`,
  `null` and `undefined` still mean OFF.
  - @aparte/engine@0.16.6

## 0.16.5

### Patch Changes

- 8593b60: Five fixes to how the chat feels: the composer no longer comes up ~200 px tall on a slow layout, a send glides to the top instead of jumping, an older message's action bar sits under the message (in the existing gap, no reserved row), a selected button-group segment reads as selected at rest, and `<aparte-split single>` shows one pane on demand.

  - **Composer (#55).** The editor sometimes rendered ~200 px tall while empty, in any host. The auto-grow read `scrollHeight` at three fixed instants and then only on input; when one fell before the box had its width, the placeholder — a `::before` that counts in `scrollHeight` — wrapped over a dozen lines and the number stuck. A `ResizeObserver` re-measures on width changes, and the placeholder never wraps (`white-space: nowrap`, clipped like a native input's).
  - **Send glide (#57).** The new user message is meant to glide to the top; it jumped. Measured: five instant `scrollTop` writes in the send's own frame (the spacer recalculation pins synchronously, the mutation observer queues another), so the smooth scroll found the view already teleported — and in framework-managed mode the observer's instant pin ran before the wrapper's `requestSmoothScroll()` was honoured (630 px in one frame on React). The glide now begins before the spacer recalculation; while it is in flight, every bottom-pin re-targets it with a second smooth `scrollTo` (`scrollend` closes the window, 450 ms budget otherwise); a user bubble the observer sees arrive is a send whoever rendered it. Streaming is instant again after the glide. Reduced motion keeps the instant path. Three engines then refined it: WebKit fires `scrollend` when a smooth scroll is re-targeted, so only a scrollend that rested at the bottom closes the window; a batch that re-adds several bubbles (a branch swap) is a rebuild, not a send, and pins as it always did; and the reader's hand ends the glide — wheel and touch stop the animation where it is, a scroll key only closes the window, because the engine animates key scrolls itself. A glide that never arrives is settled by its own timer.
  - **Action bar placement (#56).** An older message's bar floated top-right over the header row, because the bubble is a paint-containment boundary and the inter-bubble gap was a flex `gap` outside every box. The gap is now each bubble's own `padding-block-end` (same token, same distance), inside its box, and the bar hangs under the text over `message padding-block + gap` — 16 + 12 = 28 px at the default density for a 24 px bar. The last reply keeps its always-visible bar in the flow. Two theme tokens appear: `--aparte-message-padding-block` and `--aparte-message-padding-inline`; `--aparte-message-padding` is now derived from them, so a theme that overrode the shorthand should override the two parts instead.
  - **Button group (#53).** `aria-pressed="true"`, `aria-selected="true"` or `aria-current` on a segment of `.aparte-btn-group` paints it solid in the group's intent (neutral for `--surface`), at rest, and hover leaves it alone; a toggled `--outline`/`--soft` button outside a group is washed at 30 %, deeper than its 22 % hover. Before, the toggled wash was `--aparte-btn-bg-toggled` (surface-2), invisible on dark, and hover read as the state.
  - **Split (#54).** `single` (boolean) shows one pane — the one `pane` names — whatever the width: the seam and the other pane are gone, as under the breakpoint, and the seam loses its tab stop. `collapsed` still folds the primary pane to `--aparte-split-min` and keeps the seam; the CSS route `.aparte-split--only-start/--only-end` is unchanged.

  Measured with two new browser specs (the send's per-frame `scrollTop` curve and every write to it, on vanilla, React and WebKit; the older reply's bar geometry, hovered, on vanilla and React) plus 16 unit tests; the scroll-button, overlay, bubble-actions and framework-smoke geometry specs stay green. The `check:derived-vars` ceiling on responsive sizes moves 8 → 9 for the split padding token.
  - @aparte/engine@0.16.5

## 0.16.4

### Patch Changes

- @aparte/engine@0.16.4

## 0.16.3

### Patch Changes

- 9406f16: In core mode with `overlay-composer`, the transcript's scroll surface no longer overruns its host by the composer inset. `.aparte-viewport-container` is `height: 100%` and carries the overlay clearance as `padding-bottom`; without `box-sizing: border-box` the padding was added to the height, so the surface stood the whole inset taller than the viewport, clipped — that much scrollbar and content cut off at the bottom. Hosts with a global `* { box-sizing: border-box }` reset (every example app in this repo) never saw it; a page without one did. The box declares its own sizing now.
  - @aparte/engine@0.16.3

## 0.16.2

### Patch Changes

- 705224b: Moving a chat in the DOM (into an `<aparte-split>` pane, an app shell, any reparenting) no longer disconnects the composer's wiring: the editor kept the draft in the DOM but `value` never heard of it, the send button stayed disabled with text visibly in the box, and every composer button had lost its click.

  Every composer child bound its listeners inside `_render()`, behind the "DOM already there" early return, while `disconnectedCallback` removed them — so the first reconnect left them deaf. Binding is the connect's job now, in all five (`input`, `send`, `cancel`, `action`, `add-attachment`); `_render` only builds. The vanilla example's `?layout=split` and `?layout=shell` variants moved the chat exactly this way, so the bug was live on both — nothing sent a message there, which is why nothing saw it.

- 9df343c: `overlay-composer` on `<aparte-chat>` (and `overlayComposer` on all four wrappers): the transcript's scroll surface spans the whole column and the composer floats over it, so the scrollbar runs edge to edge instead of stopping at the composer's top — the full-page anatomy the Layout guide sold without this half. Opt-in, never the default: a chat embedded in a small box should not have its composer eating the transcript.

  The viewport leaves the flow (absolute over the shell); elicitation, an above-composer row and the composer keep flowing, bottom-anchored, painted over it. The viewport measures that stack and publishes `--aparte-bottom-inset`; content, the spacer and the scroll button clear it — and its readers are unconditional (0px unset), so a host that overlays a composer of its own can write the variable by hand without the attribute. When the composer grows under a reader pinned at the bottom, the inset is re-measured and the reader re-anchored in the same observer pass — the view-jump every hand-rolled overlay hits.

  The attribute is read when the viewport wires its observers: set it in the initial markup. Angular binds it on its inner `.aparte-chat-container` (there the host is the `aparte-chat` element and the viewport is the inner div's child) — use the `overlayComposer` input.

- 39b777f: The scroll-to-bottom button floats 16px above the transcript's bottom edge in framework-managed mode (React, Vue, Svelte, Angular wrappers), at every scroll position. It used to sit the whole `padding + spacer` higher — up to a few hundred pixels into the messages.

  Two causes, one per symptom. A `position: sticky` child is clamped to its parent's _content_ box, and the bottom spacer was carried as `padding-bottom` on the scrolling host — territory the button could never enter — so it hung `padding + spacer` above the edge wherever the reader was. The clearance now lives in an `::after` flex item instead: still nothing in the DOM, so the framework's reconciliation sees exactly what it saw before. And a bottom-sticky element sits at its _flow_ position whenever that is above the sticky line, so a button flowing before a 230px spacer drifted upward as the reader neared the bottom — `order: 1` puts its flow position after the spacer, and the sticky line always wins.

  If you worked around this with your own `padding-bottom: 0` + `::after` override on the viewport, you can remove it — it is now a no-op with the same values.

  Two side effects of the rework, caught on screen and now asserted in the smoke suite: an empty transcript no longer grows a scrollbar (the `::after` paid the column's gap the padding never did, and the hidden button's slide overhung the content end), and the hidden button now **fades instead of sliding** in framework-managed mode — its flow position is the very end of the content, so the 8px slide was pure scrollable overflow. Core mode keeps the slide.

  Measured in the browser (spacer 0/60/130/230px): the button holds 16px at every distance from the bottom; before, it floated 48/108/178/278px. A new e2e spec (`scroll-button.spec.ts`) asserts the rendered geometry in both transcript modes on Chromium and WebKit — the first assertion in the repo that _locates_ this button rather than driving it.
  - @aparte/engine@0.16.2

## 0.16.1

### Patch Changes

- 4040ba9: The composer examples no longer put `style="flex: 1"` on `<aparte-composer-input>` — the stylesheet already gives it `flex: 1 1 auto`, and the inline value changed the basis to `0%`.

  Nineteen examples carried it, across the element docblocks the reference pages are generated from, the guides and the demos. It worked everywhere it was written, which is what made it worth removing: copied into a row where the input's content should decide its width, `flex: 1 1 0%` collapses it instead. Reported by a consumer reading the getting-started guide.

- 6a786c3: A fenced code block written by the model now wraps instead of being silently cut off. Nothing to change on your side.

  `@aparte/plugin-marked` renders ``` as a bare `<pre><code>`, and the stylesheet's only `pre` rule was scoped to `.aparte-code-content-wrapper` — a class only the `code` **segment** renderer emits, which marked cannot produce. So a markdown block matched no rule and kept the browser's `white-space: pre`: it never wrapped, laid itself out at its own intrinsic width, and the bubble's `overflow: hidden` amputated the tail. No scrollbar, no ellipsis — the code past the edge was simply gone.

  Measured on one block: `scrollWidth` was a constant 963px at chat widths 1500, 800, 600, 512 and 380, against client widths of 776 / 724 / 524 / 460 / 328. It overflowed even at 1500. The same two declarations the code card already carries — `white-space: pre-wrap` and `overflow-wrap: anywhere` — now apply to prose as well, and the block ends on the column at every width.

  Only the wrapping is shared, not the surface: the card's padding and background belong to the `code` segment, and giving a markdown block one is a look decision rather than this fix.

- 3b5ab3e: The composer no longer goes flush to the chat's edges on a container narrower than 800px — it takes the same left/right gutter as the transcript. Nothing to change on your side.

  `.aparte-composer-shell` and `.aparte-message` both cap at `--aparte-message-max-width` (800px) and centre with `margin: 0 auto`, so on a wide container they lined up by construction. Below 800px the cap stops applying and each fills its own parent — and `<aparte-composer>` had no padding at all, so the composer went edge to edge while the messages kept their inset. Measured at a 512px chat: message column 26/26, composer 0/0. Every chat narrower than 800px was hit: phones, embedded widgets, either pane of `<aparte-split>`, and an app shell whose docked sidebar leaves the chat narrow on a wide window. `<aparte-composer>` now reads the transcript's own `--aparte-viewport-padding` on its inline axis.

  Framework-managed viewports (React, Vue, Svelte, Angular) also stop overflowing their own chat. `<aparte-chat-viewport>` is `width: 100%`, the framework path adds padding to it, and core ships no global border-box reset — so the host was 32px wider than the chat and the chat clipped it, leaving the transcript about 16px toward the end edge. Measured on a 1500px chat: the host was 1532 wide. If your app has a global `* { box-sizing: border-box }` you never saw this; if it does not, your transcript moves back to centre.

  Two things to know. Content you put directly inside `<aparte-composer>` without the `.aparte-composer-shell` wrapper now picks up the same 16px inset, the way the transcript's wrapper has always inset the messages. And the transcript reserves a scrollbar gutter that the composer cannot: on a platform with classic scrollbars the two columns still differ by that gutter (about 10px per side in Chromium) below 800px, where on a platform with overlay scrollbars — every phone — they now match exactly.

- 9f9f13d: A tool call's state ("Done", "Running") now ends on the same edge as the reply text. It stopped `--aparte-space-3` short of it — six pixels, on the one line of a turn whose whole job is to read as a quiet aside beside the prose. Nothing to change on your side.

  The row's horizontal padding is its hover surface, not its column, so a negative margin gives it back and puts the row's content on the message column. That margin was `margin-inline-start` alone: the chevron, the icon and the name landed on the column, the trailing state did not, and the hover surface bled to the left only. `margin-inline` gives both sides back.

  Measured at a 512px chat: the text spans L26/R26 and the state's right edge sat at R32; it is at R26 now, at every width. Reported by a consumer looking at a bubble that mixed a tool call and a text segment in a narrow pane — the case where the two segments sit one above the other and the eye reads the column as crooked.

- 6484a3c: Scrolling up during a streaming reply now works on WebKit. A wheel notch moves Safari about 33px at a time, and the viewport's bottom threshold is 50px — so each notch read as "still at the bottom", the follow stayed armed, and the settle chain put the reader back one millisecond later. Twelve notches, same position. Nothing to change on your side.

  The threshold's generosity is right and stays: a few pixels of layout drift must not read as "the reader walked away". What was missing is that it outranked the reader. `_readerInputAt` — the wheel, touchmove, a navigation key, a press in the scrollbar gutter — already tells a gesture from drift, and the settle logic already trusted it; the arming side did not consult it. It does now, so a decrease with a hand on it disarms whatever its size, while the same 33px with no gesture behind it is still drift and still keeps the follow.

  Measured from CI's own timestamped scroll log: wheel at 135ms, the reader at 565, `scrollTop = 598` written back at 155ms, repeat.
  - @aparte/engine@0.16.1

## 0.16.0

### Minor Changes

- 99da790: The application shell: three recipes and one element, so a ChatGPT-style page can be built on aparté alone. `.aparte-app-shell` is the grid (sidebar beside, header above, `__main` in the rest); `.aparte-app-header` is the bar (a toggle shown under 48rem, a title, an `__actions` zone); `<aparte-sidebar>` wears the `.aparte-sidebar` recipe (`__header`, `__search`, `__body`, `__footer`) and carries the three behaviours a column has — it collapses (`collapsed`, reflected; any `[data-aparte-sidebar-toggle]` toggles it; `aparte-sidebar-toggle` fires), it becomes a drawer under 48rem — or under the length its `breakpoint` attribute names, and never with `breakpoint="none"` — (`data-drawer`, a scrim, Escape, focus returned to the opener), and an input carrying `data-aparte-sidebar-search` filters the conversation list by title. Tokens: `--aparte-sidebar-width`, `--aparte-sidebar-bg`, `--aparte-app-header-height`, `--aparte-scrim`; locale key `sidebarLabel`. A guide, "An application shell", shows the whole page with a live demo.

  The line was drawn on 2026-08-29: shell chrome without product state is the library's, like the viewport is; a recipe draws, an element exists only where there is behaviour — a header has none, a sidebar has three. What stays with the product: routing, authentication, the storage adapter, the contents of a settings panel.

- 41aaee8: An approval option can carry a `description` — a second line drawn under its label, `string | (() => string)` like the label so it follows a live language switch — to say what choosing it commits to: `{ label: 'Always allow this command', description: 'git status' }` next to `{ label: 'Always allow any git command', description: 'git *' }`.

  Issue #37: a host remembered the first word of a command while its button said only "Always allow", and the panel had nowhere to show the reach of that "always". A choice question's options already had `description`; the approval side now has the same, drawn with the same body (`.aparte-elic-option-title` / `.aparte-elic-option-desc`).

- bec58ff: A per-call approval policy: `config.setApprovalPolicy((call, tool) => ruling)` decides for every tool call whether it runs (`allow`), asks at the composer (`ask`), or is refused with a sentence of its own (`deny` + `reason`). `undefined` leaves the tool's `needsApproval` to decide, as before. New exports `AparteApprovalPolicy` and `AparteApprovalRuling`; `config.getApprovalPolicy()` and `config.ruleOnToolCall(call)` read it back. A host's own `approvalResolver` on `AparteClientOptions` is untouched — it already owns the decision.

  `needsApproval` is a declaration about a TOOL; a mode ("plan": read-only, "auto": never ask) is a decision about a CALL, and the same `run_command` can be a read or an execution. The client's default channel consults the policy twice — once to decide whether the call pauses at all, so an allowed call never flashes _awaiting approval_, once to answer — and a refusal by policy reaches the model verbatim, never as "the user rejected this". `@aparte/plugin-approval` builds the four modes on this seam.

- 45574cd: A tool result can carry a structured value beside its prose: `AparteToolResult.structuredContent` (MCP's name for exactly this field) travels with the call and lands on the transcript's segment as `AparteToolCallSegment.structuredResult`. `content` is unchanged — it stays what the model reads.

  A tool renderer that had to parse its own JSON back out of the prose can read the value directly; `@aparte/plugin-ask-user`'s receipt and `@aparte/plugin-artifacts`' card both do.

- 4123389: `aparte-approval-mode-change` carries a typed detail: `AparteApprovalModeChangeEventDetail` (`{ mode, previousMode }`) is exported from `@aparte/core` and is in `AparteEventMap`, so a listener reads `e.detail` without a cast.

  The event is dispatched by `@aparte/plugin-approval`'s `<aparte-approval-mode>` when the person switches mode; it bubbles and crosses shadow roots, so a host can persist the choice from any ancestor. `@aparte/plugin-approval` re-exports the type. It is not in `APARTE_DEFAULT_UI_EVENTS` — a plugin's events never are — so under a wrapper, pass the name: `events: ['aparte-approval-mode-change']`.

  The type lives in core for the same reason `AparteModelChangeEventDetail` does: the event map is core's, and a listener in any framework reads its detail through it. `mode` and `previousMode` are plain strings — the four values (`plan`, `ask`, `auto-edit`, `auto`) are the plugin's, and core names none of them.

  `pnpm check:event-map` refuses an event dispatched with a detail and absent from the map, since every listener would otherwise cast.

- 22fe79e: A link in a model's reply can no longer choose its own target: unless it is a `_self` on a link that was staying here anyway, it opens in a new tab with `rel="noopener noreferrer"`.

  Breaking for model-authored markup only — no caller code changes, but a reply that writes `target="_top"`, `target="frame"` or a `rel` of its own no longer gets what it asked for. Nothing a _host_ writes is affected: the sanitizer only ever reads provider output.

  `target` and `rel` used to be allowlisted on `<a>` and copied through untouched, which handed the model two things. `_top`/`_parent` broke out of the frame the chat lives in — no external URL required, a same-site link did it — and in an Electron window that frame is the whole application. A NAMED target (`target="victimframe"`) opened a page holding a live `window.opener`, which is the reverse-tabnabbing the `_blank` branch has always hardened against; `rel="opener"` simply cancelled that hardening. The attribute is now read as a wish and clamped: everything becomes a new tab that cannot reach back, and a model-written `rel` never survives. `_self` is the one wish honoured, and only where it changes nothing a browser would not already do — on a same-site or in-page link. On an off-site href it is not a preference but a downgrade: that link opens a new tab when no `target` is written at all, so honouring `_self` there would hand the model exactly the frame navigation this clamp refuses.

- 22fe79e: Markup in a model's reply can no longer wear a core class name: the sanitizer now drops any class token starting with `aparte-`.

  Breaking only for a markdown or highlight provider that deliberately emitted core's own classes to borrow its recipes — a class token of any other shape is untouched, `language-*` included, which is the one class a highlighter is identified by.

  `class` is allowlisted because a highlighter's output is mostly classes, and that let model-authored markup dress itself as core's UI: `<div class="aparte-approval-option aparte-btn">Approve</div>` survived the sanitizer untouched and painted a pixel-perfect approval button inside the transcript, next to the real one. Every core surface can be forged the same way, and prompt injection is enough to write it. Core owns the `aparte-` prefix wherever it emits a class, so nothing arriving from a provider keeps one.

- 4123389: The host's `clearMessages()` takes `{ revokeAttachments?: boolean }` and passes it to the viewport's `clearAll()`, so a caller that empties the transcript and re-appends some of the same turns keeps their attachments working.

  Emptying the transcript releases the `blob:` object URL of every attachment it drops — a deliberate leak fix. A caller that puts some of those turns straight back (a compaction is the case in this repo) therefore re-appended them with dead URLs: every image and file chip on a surviving turn came back broken. Passing `{ revokeAttachments: false }` keeps the URLs alive and leaves the caller to release the ones it really dropped.

  The option is on the whole chain, and each link forwards it: `AparteChatImperativeApi.clearMessages(options?)`, `AparteChatBinding.clearMessages(options?)`, the host's `clearMessages(options?)` and the viewport bridge's `clearAll(options?)`. Optional everywhere — an existing call site and a binding of your own are unchanged, and `clearMessages()` with no argument still revokes.

  This is the half that makes `@aparte/plugin-compaction` keep those attachments under React, Vue, Svelte and Angular. Under a wrapper the transcript the plugin resolves is the wrapper's own root element, whose `clearAll` bridge dropped the argument on the floor: the plugin asked, core did not carry, and the wrapper suites stayed green because the plugin's own target is a plain array.

- a7528d1: Two of the ten pre-beta audit fixes are visible to your code: `AparteToolCallSegment.status` gains the value `failed` (with a new optional locale key, `toolFailed`), and `aparte-message-done` no longer fires for a turn superseded by a retry or an edit on an earlier bubble. The other eight change no call you make.

  A tool handler that throws now settles its row on that `failed` status — badge and locale key — instead of spinning "Running" forever; a `switch` over `status` in a renderer of your own should answer it, and a locale of your own may translate `toolFailed` (it falls back to the built-in English otherwise). A superseded turn ends on its own signal rather than the client-wide abort flag the next send resets, which is why it no longer announces a reply that was cut.

  The rest. Core stamps `data-segment-id` on the root of every renderer's output, tool renderers included — a root without it (the ask_user receipt) made every update of that segment wipe and rebuild the whole bubble, destroying a mounted artifact preview and collapsing an opened reasoning block. `AparteMessageRepository.import()` skips a repeated id (a snapshot naming itself as its own parent recursed forever). Under the four wrappers: a framework append is recorded in the viewport's tree by the same act (a manual token stream used to invent a phantom root and reverse the path on the next branch operation); the transcript's read-only-while-streaming flag has one writer per mode — `setTranscriptBusy`, written by the host — so retry, edit and the branch arrows are disabled during a reply as they were meant to be; and the conversation controller subscribes to a manager registered after `bind()`, which is every wrapper's case, so deleting the active conversation elsewhere clears the binding. The `node` entry exports the element classes as types, as the docs promised. The composer button's JSDoc no longer describes an "advance" meaning.

- 95613d0: Escape closes the sidebar drawer from anywhere on the page, opening the drawer moves focus into it, and a collapsed sidebar carries `inert` + `aria-hidden="true"` so it holds no tab stop.

  Three halves of one gap. The keydown listener was on the element, so Escape worked only once the focus was already inside the drawer — and nothing put it there, so in the documented shell it did nothing at all. It listens on the document now; the `drawer && !collapsed` guard was always the whole filter.

  Opening the drawer moves the focus to its first focusable child, so the next Tab walks the drawer rather than the transcript underneath it, and closing still hands the focus back to the control that opened it.

  A collapsed sidebar — folded to nothing as a column, slid off screen as a drawer — now carries `inert` and `aria-hidden="true"`. It was keeping every tab stop and its whole subtree in the accessibility tree while invisible. The element removes only what it wrote, so an `inert` you set yourself (the sidebar behind your own modal) survives a resize.

- 00126e3: The approval panel now shows the tool call's arguments under the question — the thing being approved is on the surface where you click.

  New `details?: string` on `AparteElicitationRequest`, and a fourth (optional) argument on `buildApprovalPanel`. Set it on your own `requestUserInput({ kind: 'approval' })` and the text appears between the question and the options, in a capped, scrollable, keyboard-reachable block. It is rendered through `textContent` — never markup, and never a render hook: the content is model-authored, on the one control in the library whose whole job is to stop a model.

  The built-in gate fills it with the call's pretty-printed JSON. Until now the panel asked _Run `delete_file`?_ and stopped there, while which file — the whole of what a person is deciding — stayed in the transcript row behind a disclosure that stays closed on purpose. The guide had promised the opposite the entire time ("name and arguments, since the arguments are what is being approved"), and so had the client's own docblock, which said the arguments stay in the transcript. Both now describe what happens.

  One function builds the text for both surfaces (`describeToolInput`, in `utils/`), because two renderings of one value drift — and here the drift would be a person approving a call they read differently from the one that runs. The transcript row still does not open itself: the panel is the decision surface now, so the last argument for unrolling it is gone. New locale key `approvalArgsLabel` (default "Arguments"), translated in `@aparte/locale-fr`.

- 08bbdae: The transcript can now be focused and scrolled with the keyboard in Safari; it carries a name for screen readers.

  `<aparte-chat-viewport>`'s scroll surface gets `tabindex="0"` and an `aria-label` — on `.aparte-viewport-container` in the default mode, on the host itself in `framework-managed` mode, since that is what scrolls there. It also carries `role="log"`, which the container already had and the host did not: `aria-label` is prohibited on an element whose role resolves to none, so a name without a role would have been the same defect mirrored. In `framework-managed` mode that makes the transcript a polite live region, as it already was in the default mode. The name comes from a new locale key, `transcript` (default "Transcript"), translated in `@aparte/locale-fr` and re-applied on a live language switch.

  If your app tabs through the page in a fixed order, there is one more stop in it, between the chrome above the chat and the composer.

  WebKit does not give an unfocusable overflow box a keyboard scroll of its own the way Chromium and Firefox do. So on Safari a plain-text transcript — no links, no code blocks, nothing focusable inside — stopped at the first screen for anyone not using a pointer, with no error and nothing on screen to say why. The framework mode looked fine and only by accident: the scroll-to-bottom button is a child of the host and stays tabbable while it is visually hidden, so Tab happened to land somewhere that scrolled. That is a coincidence, one `hidden` attribute away from taking the transcript's keyboard access with it, so both modes now say what they mean. Proven in a real WebKit run (`e2e/tests/transcript-keyboard.spec.ts`), which is the only place the defect is visible at all.

- 81d0b54: The message action bar is now one tab stop with Left/Right arrows inside it, as its `role="toolbar"` always claimed.

  Tabbing through a transcript is shorter: each bubble's bar contributes one stop instead of one per button. Inside a bar, Left and Right move and wrap, Home and End jump to the ends, and disabled buttons are skipped — while a turn is streaming, retry and edit are disabled, and a toolbar whose arrows stop on a dead control reads as broken. The arrows follow the reading direction, so in an RTL transcript Left is the one that advances.

  The bar has announced itself as a toolbar since it existed, and a toolbar IS the roving-tabindex pattern: one member in the tab order, the arrows moving between them. What shipped was five independent tab stops per message, so the role described a behaviour that did not exist — a screen-reader user told "toolbar, five items" pressed Right and nothing moved.

  The model is re-derived in the one place all three build paths already funnel through, rather than in each builder, because the bar's `innerHTML` is rewritten on a `setBubbleActions`, on entering and leaving the inline editor, and on a config change. A per-builder fix drifts the first time somebody adds a fourth path; the rebuild cases in the suite are what would catch that.

- 3590e4a: The attachment ✕ label and the searchable select's placeholder are now translatable (`removeAttachment`, `selectSearchPlaceholder`, `selectSearchLabel`).

  Three strings were hardcoded English. `aria-label="Remove {file}"` on the pending attachment's ✕ and `aria-label="Search options"` on a searchable `<aparte-select>`'s filter are each the whole of what a screen-reader user hears on an unlabelled control. The third is worse: `placeholder="Search..."` is VISIBLE text, so a French page opened the model picker and read English in the box.

  `removeAttachment` uses the `{name}` convention `approvalAsk` and `deleteConversationConfirm` already use, and the file name is interpolated raw and escaped once at the end — reusing the tile's already-escaped name would have escaped a `&` twice and read "rapport &amp;amp; co". All three are translated in `@aparte/locale-fr`, and each keeps its English literal as a fallback so a custom locale that omits one renders a word rather than an empty box.

  `node scripts/check-locale-keys.mjs` now cross-checks the two lists in both directions: a `t('…')` naming no declared key, a declared key with no default, and — the half TypeScript cannot see, because every locale key is optional — a key `@aparte/locale-fr` does not translate.

- 3c2e507: New `@aparte/core/browser` entry point: point your test runner at it so `<aparte-*>` elements upgrade under Vitest + jsdom.

  ```ts
  // vitest.config.ts — the array form matches on a regex, so ONLY the bare specifier is
  // rewritten. An object alias is a prefix alias: it would also send `@aparte/core/icons`
  // to `@aparte/core/browser/icons`, which is not exported.
  test: { environment: 'jsdom', alias: [{ find: /^@aparte\/core$/, replacement: '@aparte/core/browser' }] }
  ```

  Why it is needed. `@aparte/core` resolves the `node` export condition to a DOM-free entry, which is what makes `import '@aparte/core'` safe in Next, Nuxt, SvelteKit and Angular Universal. A test runner is also Node, so it took that entry too — and then jsdom supplied `customElements` while nothing had registered anything. `document.createElement('aparte-chat')` returned a plain `HTMLElement`, every assertion about the element's own properties failed, and no error named the cause. There was no supported specifier to escape to: the four wrappers in this repo all aliased `@aparte/core` at `../../core/src/index.ts`, reaching into another package's source.

  `registerAllComponents()` on the DOM-free entry now says so: called with a DOM present, it logs one warning naming this specifier. A warning, not a throw — the environment is legal, only surprising.

  `@aparte/core/package.json` is exported as well, so a config can `require.resolve` it instead of hardcoding a path. The main `.` entry is unchanged and still resolves `node` first.

- 3c2e507: `APARTE_DEFAULT_UI_EVENTS` gains ten names: `aparte-suggestion`, `aparte-context-threshold`, `aparte-scroll-rail-jump`, `aparte-sidebar-toggle`, `aparte-split-resize`, and the turn's lifecycle — `aparte-message-start`, `aparte-message-done`, `aparte-message-error`, `aparte-message-aborted` and `aparte-tool-approval-request`.

  That constant is what all four wrappers' `<AparteUi>` listens for when you pass no `events` of your own, so a name missing from it is an event a wrapper consumer cannot hear at all. It carried 25 of the 35 core dispatches on an element. Five of the missing ten were the entire up-stack surface of this release; the other five were excluded on a stated reason — "they go out through `window.dispatchEvent`" — that the code contradicts: `dispatchLifecycleEvent` sends them on the host element, bubbling and composed, and the composer's `window` broadcast is a second path rather than the only one.

  `aparte-abort`, `aparte-compact` and `aparte-config-change` stay out, and now for a reason that is true of them: `window` is the only place they go.

  The list is checked against core's dispatch sites by `pnpm check:event-map`, so "verified against core" is a check rather than a claim — it had been a claim twice, and been wrong twice.

- 575ec7e: Removed the unused locale key `tokensPerSecondLabel`; nothing rendered it.

  If you set it, delete the line — it is ignored. A locale annotated `: AparteLocale` (the shape `@aparte/locale-fr` uses) now fails to compile on it; a bare object literal handed straight to `setLocale` still does not, because the open half of that parameter accepts any extra key. Nothing on screen changes: it was the one key of the eighty-odd with no reader anywhere in the repo, and its JSDoc named a "tokens-per-second perf chip" this library does not have.

  A locale key is a public contract a translator pays for, so one that renders nowhere is work asked of every locale author for no screen. `config/__tests__/locale.test.ts` now asserts that every declared key appears somewhere outside its two declaration sites, over a corpus with a floor — because a walk that silently shrinks would report "no unread keys" while reading four files.

- 575ec7e: `AparteLocale` is now closed, so `t('typo')` is a compile error instead of an empty label at runtime.

  Your own extra keys still work, and still round-trip: `setLocale`, `extendLocale` and `getLocale` all carry `AparteLocale & AparteLocaleExtensions`, the new open half, so a plugin reads its own key off `getLocale()` exactly as before. What changes is `t()`, which now accepts core's own keys only — which is the point. (`AparteLocale` is a type alias rather than an interface, because an interface has no implicit index signature and so is not assignable to the extensions half.)

  The interface used to end with `[key: string]: string | undefined`, and that one line disabled the only compile-time check the locale had. `AparteConfig.t(key: keyof AparteLocale)` looks airtight; with an index signature `keyof` widens to `string` and every literal typechecks. An audit planted `t('copy') → t('copyCodeBlock')` as a deliberate mistake and nothing saw it: `tsc --noEmit` exited 0, `t()` returned `''` at runtime, and the label rendered empty with no error, no warning and nothing on screen to notice. Three keys had already reached production that way (`submitButton`, `stopButton`, `actionUpload` — read for months, declared by nobody), and a user reported the last one from a live language switcher.

  `node scripts/check-locale-keys.mjs` is the second layer, for the places the compiler cannot reach: a computed `t(key as never)`, and the mirror direction TypeScript is blind to — every locale key is optional, so a French bundle that MISSES one compiles perfectly and ships English in the middle of a French page.

- ef6913c: The default density moves one step up, to where the kits a chat is compared against sit: `--aparte-radius-unit` 2px → 3px (radii 3/6/9/12/18px), `--aparte-font-scale` 1 → 1.08 (14px body text), `--aparte-btn-size-sm/md/lg` 20/28/36 → 24/32/40px, and the focus ring at 30% of the accent instead of 15%. A theme that set any of these keeps its value; the old look is four lines away, as the "compact" preset in the theming guide.

  The kit read as plain, and the measurement said why: on every axis — radius, control size, type size, ring — aparté was one step denser than shadcn or Radix. Nothing structural changed; the scales did.

- 1b1a715: `AparteClient.compact()` and `compactionSelector` are removed: compaction is `@aparte/plugin-compaction` now (`setupCompaction()`), and the client no longer listens for `aparte-compact`. Replace `client.compact()` with `setupCompaction({ keyResolver }).compact()` — the resolver you gave the client, if any — and `compactionSelector` with the plugin's `selector` (its `prompt` option is how you replace the summarising instruction). The type `AparteCompactionSelector` is gone with them. `client.abort()` no longer reaches a compaction: the stop button still does (the plugin listens for `aparte-abort`), and from code you call the controller's own `abort()`.

  What core keeps is the contract the plugin (or a host summarising by other means) relies on: a message with `compaction: true` is drawn as a notice by the viewport (`data-kind="compaction"` on the bubble — centred, no avatar, no actions) and sent to the model under a fixed preamble saying what it is, on every history path; `_meta.compaction` on a request names a summarisation for a backend transport; `<aparte-context auto-compact>` dispatches `aparte-compact` and resets on `aparte-compact-done`. The events gain a chat: `aparte-compact-start` now carries `{ targetId }` (typed as `AparteCompactStartEventDetail`, in the event map), `aparte-compact-done` gains `targetId` and `reason` (`empty` / `nothing-to-drop` / `running` / `streaming`), `aparte-compact-error` gains `targetId` — so a gauge on a multi-chat page resets only its own.

  Why: no UI kit compacts and every agent SDK ships it as an opt-in module — a session wrapper, a middleware, a memory block. A summariser inside the client was another product's habit wearing core's type; the seam was already clean (the plugin uses only public APIs), so the behaviour moved and the seam stayed.

- 4123389: The composer's send button always means _submit_: `AparteComposerPanelMode` is `'submit' | 'none'`, the `'advance'` member is gone, and so is the locale key `elicitationNext`.

  Breaking on two lines only. A `switch` or a comparison against `'advance'` no longer compiles. And a locale annotated `: AparteLocale` — the shape `@aparte/locale-fr` uses — fails to compile on `elicitationNext`; a bare object literal handed to `setLocale` still passes, and the key is simply read by nothing. Delete the line.

  The button no longer "advances" through a form of several questions: it means submit throughout, enabled once every question has an answer, and the chips are the navigation — which was already true, since the chevron was a second way to do what a chip does. An answered chip now carries a check mark, and a `recommended` option a "Recommended" tag (new locale key `elicitationRecommended`).

  Measured against the reference product: Claude Code's question panel switches questions by tab and submits everything with one button; a click selects and never submits. Ours did the same in a form, except for the button that pretended to be a "Next".

- 8b1a1d8: `<aparte-context variant="ring">` draws the gauge as a ring with the percentage beside it, for a toolbar where a bar wants a width and a ring wants none; the full reading (`100k / 128k`) is the ring's `title`. Same levels (`warn` / `danger` recolour the ring), same events, same accessible name — only the drawing differs. Two tokens size it: `--aparte-context-ring-size` (22px) and `--aparte-context-ring-stroke` (4, in the ring's own 36-unit box). The default stays the bar.
- e4b1fbe: `<aparte-conversation-list>` rows now carry one `⋯` button that opens a menu — rename, pin/unpin, archive/unarchive, delete with a confirmation — instead of permanent archive and delete icons; the rows are grouped by date (Pinned, Today, Yesterday, Previous 7 days, Previous 30 days, then by month) as soon as an item has `updatedAt`, and `no-groups` renders them flat. Three events are new: `aparte-rename-conversation` (`{ id, title }`), `aparte-pin-conversation` and `aparte-unpin-conversation` (`{ id }`); `AparteConversationListItem` gains `pinnedAt`; `AparteConversationManager` gains `pin(id)` and `unpin(id)`.

  What changes for a host that styled or scripted the old row:

  - The row is no longer a `role="button"` div with buttons inside it. It is a plain `.aparte-conv-item` wrapping two native buttons: `.aparte-conv-item__select` (the title, `aria-current` lives here now) and `.aparte-conv-item__more`. `[data-conv-id]` still marks the row.
  - `.aparte-conv-item__archive` and `.aparte-conv-item__delete` are gone, and with them the tokens `--aparte-conv-delete-color`, `--aparte-conv-delete-bg-hover`, `--aparte-conv-delete-color-hover`, `--aparte-conv-delete-radius` and the `--aparte-conv-archive-*` fallbacks. `--aparte-conv-action-btn-size` now sizes the `⋯`.
  - The locale strings `deleteConversation`, `archiveConversation` and `unarchiveConversation` are menu items now and default to the bare verb ("Delete", "Archive", "Unarchive"). New keys: `conversationActions`, `renameConversation`, `conversationTitle`, `pinConversation`, `unpinConversation`, `deleteConversationConfirm` (with `{title}`), `cancel`, and the five `conversationGroup*` headings. Month headings are formatted with the locale's `tag`.
  - Three icon names join the provider: `more`, `pin`, `trash`. `trashIcon` and `moreHorizontalIcon` are still exported from `@aparte/core/icons`, as aliases of the same drawings.

  Why the shape changed: two permanent icon buttons on every row — one of them turning red on hover — was the loudest element of the kit, and the first thing the maintainer named when asked what looked wrong. Every chat product on the market shows one quiet `⋯` on hover, a menu behind it, and asks before the one action it cannot undo. The old row was also two buttons nested inside a `role="button"`, which assistive technology does not model, with a synthetic Enter/Space handler to make the div act; two real buttons need none of that. The menu is placed with `position: fixed` and closes on any scroll, so the list's own overflow cannot clip it and no anchoring library is needed.

- d67fa45: The artifact leaves core: install `@aparte/plugin-artifacts` and call `setupArtifacts()` to get the `<artifact>` tag, the `create_artifact` tool and the Code/Preview card back. Removed from `@aparte/core`: the `AparteArtifactSegment` type (and `'artifact'` from the `AparteSegment` union), the parser's built-in `<artifact>` recognition, the `aparte-artifact-start` / `-delta` / `-ready` / `-redownload` and `aparte-file-gen-ready` / `-error` events and their detail types, the `artifactRedownload` / `artifactRehydrate` host handlers, `setArtifactPreviewBuilder` / `getArtifactPreviewBuilder` and `AparteArtifactPreviewBuilder`, `_meta.artifactHint`, `deriveArtifactKind`, the artifact stylesheet and its `--aparte-art-*` tokens.

  An artifact is a convention an app teaches its model, not something a model does by nature — so it is a plugin, end to end, like `ask_user`: a real tool, a renderer on its result, and a block grammar registered on the parser through the new `registerStreamBlock`. What core keeps is generic: the parser seam, `AparteToolRenderer.update`, and one rule in the history serializer — a segment of a type core does not know contributes its `content`, else its `fallback` — which is what kept an artifact readable by the model on the next turn and now covers every consumer type the same way. The eight locale strings the card reads (`download`, `preview`, `code`, `generating`, `rebuildingPreview`, `previewPending`, `sandboxError`, `sandboxErrorHint`) stay in `AparteLocale`, because a locale package translates one bag — `@aparte/locale-fr` is untouched.

- 32762be: `setElicitationOptions({ answerOnClick: false })` makes a single-choice question select-then-send (radios plus the composer's button) instead of answering on the click; the default stays `true`.

  A question asked on its own with one choice — an `enum` without `multiple` or a `default`, a `boolean` without a `default` — renders its options as buttons, and the click is the answer. That is the shape every chat product uses and it stays the default; the switch exists for a host that wants a uniform "select, then send" across every question, or the chance to change one's mind before committing. It is the host's policy, like `allowOther` and `layout`: a form of several questions always collects and submits, whatever it says.

- 0556897: The only model of the only registered provider is selected on its own, and a send dropped for want of a model says so in the console, once. `registerAIProvider()` selects the model when exactly one provider is registered, it lists exactly one model synchronously, and nothing is selected yet — a scripted or in-browser provider — and never overrides a choice already made or one among several. Nothing changes for a provider whose list comes from a fetch.

  Issue #29: a page built from the docs alone, with `@aparte/provider-scenario` and no `<aparte-model-selector>`, sent nothing — the user's message sat there, no error, no console line — because no model was selected and there was nothing to select. The getting-started CDN snippet names its model now.

- 6ba8397: The kit has a dialog: `.aparte-dialog` styles the browser's own `<dialog>` — `__header`, `__title`, `__close`, `__body` (the region that scrolls), `__footer`, the `::backdrop`, `--sm` / `--lg` widths, a full-screen sheet under 30rem — and three attributes wire it with no script: `data-aparte-dialog-open="id"` on any control calls `showModal()` on the dialog it names, `data-aparte-dialog-close` inside one closes it (its value becomes the dialog's `returnValue`), and a click on the backdrop closes it unless the dialog carries `data-aparte-dialog-static`. `installDialogTriggersOnce()` is exported for a host that builds its page before importing core.

  Issue #32, item 1. The kit used to say a modal was "deliberately absent — it needs a portal and a stack manager"; the browser has had both since 2022 in `<dialog>` + `showModal()` (top layer, focus trap, Escape, focus return), so the recipe styles that element and nothing wraps your content — a custom element that moved children into an inner `<dialog>` would have broken every framework that renders them.

- c546d09: Two UI-kit classes: `.aparte-menu__body` + `.aparte-menu__description` for a two-line menu item, and `.aparte-field-warning` for a field's sub-text in the warning tone.

  Both came from a shell moved onto the kit: a mode picker whose rows carry a name and a description had to lay a grid over `.aparte-menu__item` so the check gutter spanned both lines, and "this setting invalidates the saved states" had only `-hint` and `-error` to be painted as. The menu banner now also says that the check mark of a `menuitemradio` / `menuitemcheckbox` is drawn by the kit from `aria-checked` — the same consumer added a "✓" of his own and got two.

- 9a29df6: A link in a reply opens in its own tab, and a host can intercept it: the built-in sanitizer sets `target="_blank" rel="noopener noreferrer"` on every external `http(s)` link it lets through, and the bubble dispatches a cancelable `aparte-link-click` event (`detail: { href, anchor, messageId }`, bubbles to the chat host) before the browser follows any link in a message body — `preventDefault()` cancels the navigation so a host can route the link itself.

  A bare same-site or in-page link (relative, `#`, `mailto:`) is left as written. A same-site link that carries a `target` of its own is not: see the entry on model-written `target` and `rel`, which the sanitizer clamps rather than copies — only `_self`, and only where the link was staying here anyway, is honoured.

  Issue #38: `marked` sets no `target`, and the sanitizer only added `rel` when one was already present, so a model-written link was a bare `<a href>` that navigated the frame the chat lives in — in an Electron window, the whole application. A host that wants the old behaviour wraps the default sanitizer through `setHtmlSanitizer()` and strips `target` again.

- d284c7e: New element `<aparte-scroll-rail>`: a rail of ticks beside the transcript, one per user turn (`every="message"` for one per message), that marks which message is under the reader and jumps back to any of them on a click. Place it as a direct child of `<aparte-chat>` (or the wrapper's host); it floats on the transcript's end edge, hides under a coarse pointer, and renders nothing below two ticks. A click fires a cancelable `aparte-scroll-rail-jump` (`{ messageId }`) before the `scrollIntoView`, so a host that pages history in can load it first. Four knobs: `--aparte-scroll-rail-width`, `-tick-size`, `-tick-thickness`, `-gap`; one locale key, `scrollRailLabel`.

  It reads the transcript and never owns it: which bubbles exist (a mutation observer on the chat), which one is under the reader (an intersection observer on the scroll surface), and the first words of each for the tick's name. No product ships this natively — it exists as browser extensions and as open requests — which is why it is here.

- ea6fe97: Add `<aparte-split>`: two panes and a seam you can drag, arrow or collapse — the builder split, as an element.

  `position` in and one `aparte-split-resize` out on release; the library stores nothing, so persistence is one `localStorage.setItem` in your listener. The attribute is written on COMMIT only — a release, a key up, a double-click, a property set — and the live value during a drag travels on `--aparte-split-position`, so a framework's reconciler is never in the drag loop. The number you get back is the ACHIEVED size after the clamp, so the attribute, `aria-valuenow` and the event's detail are one number.

  The bounds are CSS: `--aparte-split-min` (20rem) and `--aparte-split-max` (60%) are clamp arguments in the grid template, so px, %, rem and ch all work and nothing in JS parses a unit. `--aparte-split-handle-size` (4px) is the seam and `--aparte-split-hit-area` (12px, the touch target on a coarse pointer) is the invisible zone you can grab it by.

  Keys, on the seam: the arrows step 1%, Shift 10% (an ecosystem convention, not the APG), Home and End go to the bounds, Enter collapses and a second Enter restores the size it had, Escape cancels a drag in flight. `aria-orientation` on the seam is the inverse of the element's `orientation` — the attribute names the SEPARATOR's axis, which is what ARIA 1.2 and the APG's window splitter mean by it.

  Under `breakpoint` (48rem by default, `none` to never stack) it shows one pane and writes `data-stacked`; any `[data-aparte-split-pane="start|end"]` on the page switches it with no script, the way `[data-aparte-sidebar-toggle]` drives the sidebar. The value picks the split first and the pane second: `start` or `end` reaches the split the control sits inside — or the first one on the page — and any other value names a split's `id` and toggles that one, so a control aimed at a particular pane goes inside its split. If you own your own breakpoints, set `breakpoint="none"` and put `.aparte-split--only-start` / `--only-end` on the element yourself: it reads those classes exactly as it reads `data-stacked`. `orientation="vertical"` stacks the panes and moves the seam to the block axis; `primary="end"` sizes the last pane instead of the first.

  The recipe works without the element: `.aparte-split` is a grid you can set a position on from your own media query, `.aparte-split--vertical` / `--primary-end` / `--only-start` / `--only-end` are the class form of the four states, and `.aparte-split__pane` is the scrolling wrapper for the pane that is not a chat. A pane CONTAINS a chat; a chat never contains a split.

  New locale key `splitHandleLabel` ("Resize the panes", "Redimensionner les panneaux") names the seam.

- 0e20e36: `registerStreamBlock({ tag, toSegment })` teaches the stream parser a tagged block: `<tag attr="…">…</tag>` in the model's prose becomes the segment you build, streamed delta by delta. `AparteStreamParserOptions.blocks` takes the same grammars when you drive the parser yourself.

  Models write conventions into their prose — `<think>` for reasoning, `<artifact>` for a document, `<file path>` for a patch, `<cite>` for a source — and until now each one was a branch hard-wired into the parser, which is how the artifact ended up in core while being an app convention. The parser now does the streaming work once for every grammar: the earliest opening tag wins against a code fence and a reasoning delimiter, a tag cut at a chunk boundary is held back, attributes are parsed quoted or bare, a closing tag split across two chunks never leaks as content, a self-closing tag is a block with no body, and a block still open at the end of the stream is closed with what arrived. `toSegment` runs once, at the opening tag; the segment it returns carries a `content` string the parser fills. The blocks are read by the stream adapter when a turn starts. `AparteStreamBlock` and `AparteStreamBlockMatch` are exported; `unregisterStreamBlock(tag)` and `getStreamBlocks()` complete the set, and `reset()` clears it.

- 99f7e4a: The user bubble's tint, `--aparte-surface-3` and `--aparte-text-inverse` derive from the masters; an eight-line rebrand now moves them, and the default user bubble is a wash of the accent rather than a fixed plum.

  `--aparte-message-content-bg-user` was a literal in both palettes (`#efe7f6` / `#2f2740`), the one colour the theming guide's eight-line rebrand could not reach — a chat moved to a blue brand kept a plum bubble. It is now `color-mix(in srgb, var(--aparte-primary) 12%, var(--aparte-surface-1))`, declared in the anchored layer so a per-instance `--aparte-primary` re-tints it. `--aparte-surface-3` is the second surface pulled 6 % toward the text (the same figure both literal pairs encoded), and `--aparte-text-inverse` reads `--aparte-surface-1`. The three names still exist and still win when you declare them — only their defaults moved. The theming guide lists what stays literal after this: the status colours and `--aparte-secondary` / `--aparte-neutral`.

- 259e785: A tool renderer registered with `registerToolRenderer` can declare `update(element, segment)` and `relabel(element, segment)`; with `update`, a change of the call (its result landing, a decision, a failure) is patched into your element instead of rebuilding it from `render()`.

  Without `update` core rebuilds — which it always did, and which is right for a receipt and wrong for anything with state: a mounted preview, an opened disclosure or a focused control was lost the moment the result landed. `relabel` is forwarded to your renderer on every config change (`setLocale`, `setIconProvider`, `reset()`) and core no longer applies its own pill selectors to markup it did not draw. Same two contracts as `AparteSegmentRenderer`, which is what makes a renderer that serves both a tool call and a segment a single implementation.

### Patch Changes

- 22fe79e: Links written as `//host`, `/\host`, `http:/host` or with leading whitespace now open in a new tab like every other external link.

  The hardening tested the RAW attribute against `^https?://`, while the check that ACCEPTED the URL normalised it first (`isSafeUrl` strips control and space characters, so `" https://evil.example"` is accepted and `//attacker.example` passes as a relative URL). Both are external once a browser resolves them, and both kept the default target — they navigated the frame the chat lives in, which is the one thing this rule exists to prevent, and the docs promised the opposite. The external test now reads the same normalised value the accept path did.

  Two more spellings resolve off-site and the allowlist accepts both: a backslash is a slash to a URL parser on a special scheme (`/\evil.example` is a relative URL), and a single slash after an explicit scheme enters authority state when that scheme differs from the page's (`http:/evil.example`). Measured with Node's WHATWG URL against base `https://site.example/chat/`, both land on `evil.example`. They are hardened too.

  It stays a string test rather than `new URL(value, document.baseURI)`: this module has a documented DOM-free path, and resolving would quietly turn the rule into "cross-origin" instead of "external".

- 22fe79e: The DOM-free sanitizer (the `node` entry) now strips handlers written as `<img src=x/onerror=…>` and removes an unclosed `<svg>`/`<math>`/`<form>`.

  When there is no `DOMParser` — SSR, Node, a test runner — the built-in degrades to a regex net, and that whole branch was untested. It had two hand-written tag lists that disagreed: `svg`, `math` and `form` were only in the paired pass, so an unclosed one walked straight through, and `button`/`select`/`title` and the rest were in neither. Its handler stripper demanded whitespace before `on…`, while HTML also ends an attribute at `/` and at the closing quote of the previous value, so `<img src=x/onerror=…>` and `<img src="x"onerror="…">` kept their handlers.

  The handler pass also ran once, and it consumes the separator in front of the handler it removes — so two written back to back (`<img src=x onload="0"onerror="alert(1)">`) lost the quote that separated the second one and it survived. It now runs to a fixed point; the replacement is a space, which restores the separator for the next round.

  Both tag passes now read `DANGEROUS_TAGS`, the same list the DOM path uses — the three document-structure tags (`html`, `head`, `body`) lose their tags but keep what they wrapped, matching what a real parser does with them. The net remains a safety net and not a security boundary: for untrusted HTML off the browser, register a real sanitizer (DOMPurify + jsdom) via `setHtmlSanitizer`.

- 4123389: `createAparteChatHandler` answers a failed vendor fetch with `502 Vendor request failed.` and an unknown `providerId` with `400` even when the name is an inherited key such as `__proto__` — two status codes a caller may see change.

  The 502 body is now a fixed string. It used to be the exception's own message, and that message can name the URL it tried: `authQuery` (Gemini's `?key=`) puts the API key in the URL, and a custom `fetchImpl` prints the URL in its error text (`node-fetch`: `request to ${url} failed, reason: …`). The vendor's prose goes to the server's log via `console.error`, never to the client — the same rule the non-`ok` branch already followed.

  The 400 is the `providerId` lookup. It read `options.providers[providerId]` on a client-supplied string, so on a plain object literal `providers["__proto__"]` and `providers["constructor"]` resolve to a truthy inherited value: the "Unknown providerId" 400 was skipped and the request fell through to a 500 further down. The lookup is `Object.hasOwn` now.

- 5e0c4e7: A stream block whose attribute value contains `>` (`title="v1 -> v2"`) now keeps its attributes instead of losing them all and leaking the raw tag into the body.

  The opening tag was cut at the first `>` in the buffer, wherever it fell. `<note kind="a>b" title="t > u">` therefore ended after `a`, so no attribute parsed (`kind` fell back to the grammar's default) and `b" title="t > u">` was streamed into the segment's content as literal markup. The tag now ends at the first `>` outside a quoted value; a quote only opens after an `=`, so a stray `"` written in prose or in an attribute-less tag cannot hold the buffer open, and an opening tag still incomplete at a chunk boundary is held for the next chunk exactly as before.

  One malformed shape reads differently: a quote the model opens and never closes. Its value now runs to the end of the line, so the tag is read at its first `>` once the line ends rather than as soon as that `>` arrives. If the reply never breaks a line after such a tag, the tag and everything after it arrive as one plain-text run when the reply ends, instead of opening a block with a truncated attribute.

- 5e0c4e7: Reusing an `AparteStreamParser` after a reply that ended mid-fence or mid-block no longer swallows the next reply.

  `finalize()` flushed what was left but never spent the mode it was in. A reply cut off inside a ``` fence, a `<think>` block or a registered `<tag>` left the parser waiting for a closing delimiter that would never come, so the first characters of the NEXT reply were eaten by that wait — silently, with no segment to show for them. The built-in client builds a fresh parser for every turn, so this bites a consumer who drives `AparteStreamParser` themselves and keeps it across replies — the bring-your-own-loop path. `finalize()` now returns the parser to `text` with an empty buffer and no armed delimiter.

- 3a0f593: `<aparte-context auto-compact>` asks for a compaction again after one was refused or failed; it used to ask once and never again.

  The request was spent only by a compaction that actually landed. A skip — nothing to drop yet, a stream in flight, another compaction running — returned before the flag was cleared, the level never left `danger` with the usage still climbing, and the gauge stayed silent for the life of the element. The request is now made per turn: one stays open until the plugin answers (done, skipped or failed), and the next turn still in danger asks again. Nothing changes for a compaction that succeeds.

- 95613d0: `aparte-sidebar-toggle` announces a change, never the starting state: `<aparte-sidebar collapsed>` is silent at mount, and so is a sidebar that enters as a closed drawer on a narrow window. Read `collapsed` after connect for the state it started in.

  The element used to read its markup as a change. During an UPGRADE — the ordinary case for server-rendered markup, where the module loads after the HTML — `attributeChangedCallback` fires for every authored attribute while the element is already connected and before `connectedCallback` has run. `collapsed` was therefore announced as a toggle the host never asked for, carrying `drawer: false` because the media query had not run yet: a host persisting that detail wrote "the column is open" over a drawer that was closed.

  `connectedCallback` stamps what the markup asked for AFTER the breakpoint has been applied, and the attribute callback is gated on that, the way `<aparte-split>` already was.

- 95613d0: Widening the window past the drawer breakpoint reopens the sidebar only when nothing had collapsed it as a column: `<aparte-sidebar collapsed>` in the markup, or a host collapse taken outside the drawer state, keeps it folded.

  `_applyDrawer` reopened on every exit from the drawer state, against its own docblock ("unless the host had collapsed it before" — nothing recorded that). So a host that folded the column, or markup that shipped `<aparte-sidebar collapsed>`, got it back the first time the window crossed 48rem.

  The element now records a collapse only when it is taken OUTSIDE the drawer state — dismissing an overlay says nothing about what a wide window should show — and its own breakpoint writes never count as the host's intent.

  That intent is read from the markup once, on the first connect. A re-parent — a framework re-render, a tab swap, dragging the panel elsewhere — runs `connectedCallback` again, and by then `collapsed` can be the breakpoint's own doing: reading it a second time recorded the element's write as the host's word and the column stopped reopening for good.

- 4a508e4: `reset()` and a double-click on the seam return an `<aparte-split>` to the position its markup declared, and a split folded before a move reopens at the size it had — both survive a re-parent (a framework re-render, a tab switch, dragging the panel elsewhere).

  A re-parent — a framework re-render, a tab switch, dragging the panel elsewhere — runs `connectedCallback` again, and by then the `position` attribute holds the last commit rather than what the author wrote. The element captured it as the initial position, so `reset()` and a double-click on the seam went back to wherever the reader last dragged the seam.

  Worse when it was folded: a collapsed split reflects `position="0"`, so the re-mount recorded 0 as the size to restore and `expand()` reopened onto nothing. The size it had before it folded is now kept across the move.

- 9eccccc: The dialog recipe dismisses on a backdrop click only when both ends of the gesture landed on the backdrop: selecting text inside the box and releasing outside it leaves the dialog open, and a programmatic `dialog.click()` does not close it — call `close()`.

  A `click` fires on the nearest common ancestor of where the press landed and where it was released, so a selection dragged a few pixels past the box targets the `<dialog>` itself — identical, from the click alone, to a deliberate press on the backdrop. Reproduced in all three engines, in both directions (press outside, release inside, same result).

  So the dismissal asks for the press as well: `installDialogTriggersOnce()` records where `pointerdown` landed and the `click` handler only dismisses when that was the backdrop too. The cost is the second half of the first line — a synthetic click has pressed nothing, so it is not a dismissal.

- 3590e4a: The `<aparte-split>` resize seam draws a real focus outline when it takes keyboard focus: `outline: var(--aparte-focus-outline-width) solid var(--aparte-border-focus)`, measured 3.54:1 against the page in the light palette and 7.36:1 in the dark one.

  `.aparte-split__handle:focus-visible` was `outline: none` plus the soft `--aparte-focus-ring` shadow and nothing else. Measured, that ring is 1.39:1 against the page in the light palette and 1.83:1 in the dark one, where WCAG asks 3:1 of a focus indicator — so the seam's only keyboard affordance was, in practice, absent. It matters more here than almost anywhere else in the library: the seam is a 4px band with `border: 0` whose entire story is arrowing it, so a keyboard user who cannot see the focus has no other way to find it.

  It now paints `outline: var(--aparte-focus-outline-width) solid var(--aparte-border-focus)` — 3.54:1 light, 7.36:1 dark — and keeps the shadow beside it as decoration, since a glow around the seam and an outline on it do not fight. The forced-colors entry in `responsive.css` is unchanged and now overrides an outline that exists rather than substituting for one that does not.

- 3590e4a: The ✕ on a pending attachment now appears when it is focused and on touch devices — it was the only way to remove one.

  `.aparte-thumb__remove` sat at `opacity: 0` with a single `:hover` rule to reveal it. A keyboard user tabbing onto it got a focus ring drawn around nothing; a touch user, who cannot hover at all, never saw it and could not drop a file attached by mistake. The sheet now pairs `:focus-within` with the hover rule — the same pair the message action bar and the conversation row already use, which is what makes this an omission rather than a design — and the coarse-pointer block shows it outright, beside the conversation row's ⋯ that is there for the same reason.

  `e2e/tests/attachments.spec.ts` passed through all of it: Playwright's visibility check ignores `opacity`. The new unit suite asserts the sheet and the control together, because the two halves hold each other up — `:focus-within` can only ever match if the ✕ is genuinely focusable.

- 3c2e507: `querySelector('aparte-context' | 'aparte-split' | 'aparte-suggestions')` is now typed — the cast and the untyped `e.detail` are gone.

  Those three were the only elements missing from `HTMLElementTagNameMap`: 21 of 24 were mapped, and the three left out were the whole up-stack surface of this release, so the shell code most likely to be written this month was the code that needed a cast.

  The map's docstring said `pnpm check:element-map` kept it honest. No such script has ever existed. It is pinned now by a type assertion against the generated `AparteElementTagName` — which comes from the custom-elements manifest and therefore carries every tag by construction — so a missing entry is a compile error naming the tag, in the editor and in `nx typecheck`, which is what the pre-commit hook runs. The other direction (a key no element backs) is a test, because `HTMLElementTagNameMap` is a global interface the plugins augment too.

  Two other claims in that docstring were wrong and are corrected: the file is imported by the SSR entry as well as the browser one, on purpose.

- 3c2e507: `registerAllComponents()` now references every element class (24, not 4) and names the ones that are missing.

  It looked up four tags — chat, viewport, bubble, status — and on a miss logged "Some components may not be registered." Both halves failed the reader the guide sends here. A bundler that dropped `<aparte-split>` or `<aparte-composer-toolbar>` produced a silent green, because those twenty were never checked; and anyone who did see the warning was told nothing about which module to import.

  The function now reads one `[tag, class]` array covering all 24, and the warning lists the missing tags by name. The registrations themselves are unaffected either way: the browser build is one module, `dist/index.js`, which `sideEffects` names, so all 24 `customElements.define` calls ship in it whether or not anything references the classes.

- 3a0f593: `<aparte-context>` declares the `aparte-compact` event it dispatches, so it appears in the shipped custom-elements manifest, on the element's docs page, and in the editor tooltip that manifest feeds.

  The gauge has dispatched it on `window` since `auto-compact` existed — that is the whole of what the attribute does — and it carried no `@fires`, so it was absent from the shipped custom-elements manifest, from the element's generated page, and from the editor tooltip a consumer reads. It was typed in `AparteEventMap` and described in prose the entire time, which is what made it invisible: every list a reader consults said the element fires one event.

  The dispatch is typed with its detail (`AparteCompactEventDetail`) rather than an anonymous `CustomEvent`, and the event map's comment is corrected — it said "Core never sends these" of a block of five, which was false of four of them, the gauge's own included.

- 4a508e4: `<aparte-split pane="end">` keeps that pane when it loads stacked on a narrow screen, and every `showPane()` that changes the pane commits it and fires `aparte-split-resize`.

  Entering the stacked state showed the start pane unconditionally, deleting the choice the markup had already made. And because that write happens during the mount, where the attribute callback is suppressed, the element never recorded it: a later `showPane('end')` looked like no change and committed nothing, so the host heard no `aparte-split-resize` and its two-button toggle went dead once.

  The stacked check also read the `stacked` getter, which counts the CSS route (`.aparte-split--only-start` / `--only-end`) as well as the element's own `data-stacked`. A `breakpoint="none"` split wearing one of those classes therefore looked, at mount, like a split leaving a state it had never entered — and had its authored `pane` removed on the way in.

- 5e0c4e7: A `registerStreamBlock` grammar's `toSegment` runs exactly once per tag, with prose before the tag or without — safe to count, allocate or register in.

  `a <note kind="k"/>` emitted the right segments, but built them twice: the text run went out first and the tag was left in the buffer to be re-read on the next step, so a grammar that counts, allocates or registers something in `toSegment` did it a second time and threw the first result away. The tag is now consumed once and the block it built waits its turn. What comes out, and in which order, is unchanged.

- 3a0f593: `<aparte-context>` now formats its numbers with `locale.tag` instead of the browser's.

  Both `Intl.NumberFormat` calls in the gauge passed `undefined` — "follow the BROWSER" — which is exactly the bug `AparteLocale.tag` was added to close, and which `<aparte-conversation-list>` and the bubble's clock already read it for. So an app that called `setLocale(fr)` moved fifty strings and left the gauge counting in en-US: `14%` where French writes `14 %`, and `128K` where `ja-JP` writes `12.8万`.

  Both the bar's reading and the ring's percentage follow the tag now, including the meter's `aria-label`. A locale with no tag still follows the browser, which is the documented English default.

- 33c62b5: Two sends fired back to back keep their order, and an attachment named `A & B.png` reads as itself in the tooltip and the alt text.

  A second send arriving while the first is still creating the conversation waits for it, so the two messages land in the order they were typed and the auto-title comes from the first. The attachment name was escaped twice on its way into the thumbnail's `title` and `alt` — escaped once as text, then handed to `escapeAttr` — so `A & B.png` was displayed as `A &amp; B.png`.

  The rest, none of which changes a call you make. `modelSelectorPlaceholder` and `approvalModeLabel` are declared fields of `AparteLocale` (no value or behaviour changes — they were already read, just undeclared). `cssEscape` also escapes a newline. `updateMessage({ segments })` on a bubble copies the array in, as `setSegments` does, so a caller that mutates its own array afterwards does not reach into the bubble. The `headers` JSDoc says the session cookie only rides a same-origin endpoint; `setBubbleActions`'s example no longer claims `{ copy: false }` hides everything; `AparteClient` loses an abort-controller set nothing ever added to.

- ecd50e2: The scroll-to-bottom button leaves the tab order while it is hidden.

  Hidden meant opacity 0 and no pointer events, which the keyboard cannot see: the button stayed a tab stop while invisible, so Tab landed on nothing between the transcript and the composer. With the transcript now a stop of its own, that phantom stop pushed the composer past the eighth Tab on the vanilla example — the e2e that says a keyboard user must not hunt for the editor caught it on all three engines. A hidden button carries `tabindex="-1"` and `aria-hidden="true"`; both go the moment it shows.

- bc75c30: The copy buttons now work on plain `http://` — a code block, the artifact card and the bubble's action bar fall back to `document.execCommand('copy')` where `navigator.clipboard` does not exist. `copyText(text)` is exported so your own copy button can take the same path.

  `navigator.clipboard` is secure-context only. On `http://192.168.1.x` — the LAN box running a local model, this library's own archetypal deployment — the property is `undefined`, so each of the three buttons threw a TypeError in its click handler before the `.catch()` it carried for a _rejected_ write, and did nothing, silently. Same wall as `crypto.randomUUID` and `uuid()`; `pnpm check:secure-context` now confines both APIs to their one fallback.

- fb14521: A field group's prefix and suffix (`.aparte-field-group__prefix` / `__suffix`) sit on their own ground — `--aparte-surface-2` with a rule against the field — instead of the field's. Muted text on the same ground, "https://" read as the start of what the user had typed. The group clips to its corners for it (`overflow: hidden`); the focus ring is a shadow on the group, outside that box, and is not clipped.
- 4b8bd15: The sidebar's collapse and the drawer's slide are animated: `--aparte-duration-slow` for the 260px fold, `--aparte-duration-slower` for the drawer, and both are stopped under `prefers-reduced-motion`.

  Both transitions named `--aparte-duration-normal`, a token `theme.css` has never declared — and a `var()` that resolves to nothing invalidates the whole `transition` shorthand at computed-value time, so neither property transitioned at all. They read `--aparte-duration-slow` (the 260px fold) and `--aparte-duration-slower` (the drawer, which travels the whole column plus its shadow). Nothing else changed, so a reader who learned the snap will read the slide as new behaviour: it is the behaviour the sheet always described.

  The sheet's own `@media (prefers-reduced-motion: reduce)` block goes with the fix. `responsive.css` already re-declares every duration token to `0.01ms` under that query, at the source — a second, hand-written patch for two selectors was the drift that hid the missing token in the first place.

- 2f8fa7c: The switch's thumb is centred in its track, and the track is 40×22 with a 2px inset. The thumb's size is now derived from the track (`--aparte-switch-thumb-size` = height − 2 × border − 2 × inset) instead of being a fourth number set by hand, so the three cannot drift apart again; a theme that changes the height gets a thumb that still fits. `--aparte-switch-width`, `--aparte-switch-height` and `--aparte-switch-thumb-inset` are the knobs.

  It had been off by a pixel on one axis and the four values had been tuned separately — a defect you saw the moment the density preset made the control larger.

- ebe003e: The transcript reserves its scrollbar gutter on both edges (`scrollbar-gutter: stable both-edges`), so the centred column no longer shifts by half a scrollbar the moment the first reply overflows. Applies to the vanilla scroll container and to the framework-managed viewport alike; a host that wants the old behaviour sets `scrollbar-gutter: auto` on `.aparte-viewport-container`.
- 1a9da39: The viewport keeps confirming its scroll position while a rebuilt transcript's height is still settling, instead of giving up at the first frame the gap looks closed.

  A layout settles in stages, so one `scrollTop` assignment is not enough and the viewport confirms it over the frames that follow. That confirmation was bounded by four frames and stopped at the first frame the gap was closed — and a rebuild is exactly the case that re-opens it. Measured on react-webkit: a branch swap churned the scrollable max 891 -> 1091 -> 891, the gap closed against the tall layout so the chain ended, the height then fell back with the engine holding the position at 720, and the transcript stood 171px short with auto-follow still armed and a scroll-to-bottom button on a reader who never left.

  Two changes. The confirmation is bounded by 400ms instead of four frames — a frame count is a proxy for time that fails precisely on the slow engine — and it keeps watching after a gap closes, until the window is over. And a decrease the reader did not make, which leaves a gap while the follow is armed, re-opens that window; nothing else could close it, since the rebuild's mutations are over and the resize observer watches the host's box, not the transcript's content.

  A reader is still left alone: the intent flag is re-read every frame, and a gesture, a drag-selection upward or a find-in-page jump all disarm the follow before the new path can be reached. A scroll of ours that is still moving down is left alone too — that is every frame of a smooth scroll, and re-anchoring one of them would abort the animation. During a stream the confirmation is now one chain rather than one per token.

  What this does NOT close: the react-webkit branch-swap failure that started the investigation still reproduces at the same rate (18/20 first attempt, with and without this change). Its captured mechanism is a different one — WebKit moves the position up by 36-338px with the scroll height standing still, before the press, which the classifier reads as the reader and disarms the follow — so both new paths, gated on the follow being armed, are inert on it.

- 4e04443: The four wrappers render `<aparte-elicitation>` inside their host by default; pass `elicitation={false}` (`:elicitation="false"` in Vue, `[elicitation]="false"` in Angular) to opt out. **If your app registers its own presenter with `setElicitationPresenter()`, you must pass it**: the built-in presenter registers with the chat as its owner and wins the match for that chat's requests, so without the opt-out your questions would open core's panel instead of your presenter.

  Core's `<aparte-chat>` has shipped the presenter in its default composition since the built-in approval gate started asking through it, and the wrappers had not followed: a `requestUserInput()` under `<AparteChat>` rejected with the "no presenter" warning, and that warning told you to add the element "inside your `<aparte-chat>`" — a tag the wrappers do not render. The first consumer to hit it appended the element to `[data-aparte-chat]` by hand. The warning now names the framework host too, and the composer's docblock names the four lifecycle events that drive its `streaming` flag (`aparte-message-start` sets it; `-done` / `-error` / `-aborted` clear it) instead of "lifecycle events on window".

- Updated dependencies [c2cab7f]
- Updated dependencies [45574cd]
- Updated dependencies [b90c4c4]
- Updated dependencies [1b1a715]
- Updated dependencies [46dfbdb]
  - @aparte/engine@0.16.0

## 0.15.1

### Patch Changes

- 4856ab6: `AparteAIProviderMetadata` is now really importable from `@aparte/core`. 0.15.0's changelog announced it and the package disagreed: the name had been added to the types module and not to the root barrel, whose type list is explicit, so the import was still TS2724 in the published `dist/index.d.ts`. A consumer checked the tarball. A test now imports it from the barrel, type-checked, so the barrel cannot drop it again quietly.
  - @aparte/engine@0.15.1

## 0.15.0

### Minor Changes

- 7502ed0: `appendMessage(message, { historical: true })` now reaches the host from every wrapper — the React ref handle and `useAparteChat`, the Vue instance and `useAparteChat`, the Svelte component and `createAparteChat`, the Angular component — and `AparteChatImperativeApi` declares the option. A restored message is adopted as it is: no fresh timing stamps, `isStreaming` forced off, so a tool call read back from your own backend renders settled rather than spinning.

  The host had accepted the option all along (it is how a stored conversation loads), but every wrapper's `appendMessage(m)` dropped the second argument on the way, so the replay-one-message-at-a-time path the core tests exercise was unreachable from a framework. Found by the second consumer, whose history lives on its own server.

### Patch Changes

- 4590cbe: A focused option in the elicitation panel keeps its whole focus ring. The options sit in a scroll container, which clips at its padding edge, and the ring is drawn outside the option's box — so a keyboard-focused option lost 4px of ring on every side (the border looked cut). The container now pads by the ring's size and takes the space back with a negative margin, in the same tokens the ring reads (`--aparte-focus-outline-width`, `--aparte-btn-focus-offset`), so nothing moves and a wider ring gets a wider room. `scroll-padding` keeps a focused option's ring in view when the list scrolls.
- 4b73f83: `AparteAIProviderMetadata` — the return type of a provider's `getMetadata()` (name, id, icon, colour) — is exported from `@aparte/core`. A provider written outside this repository had to spell it `ReturnType<AparteAIProvider['getMetadata']>`; reported by a consumer in July and again now.
- 06e028b: A tool call's input and result now wrap inside the bubble instead of running past its edge. A one-line result — an error message, a long path — was 1 823px of text in a 723px body (407px on a phone): the `<pre>` kept its default `white-space: pre`, so the whole disclosure was clipped at the message's edge. It gets the same pair the code block already had, `white-space: pre-wrap` + `overflow-wrap: anywhere`; a stylesheet that targeted `.aparte-tool-part-body pre` keeps working, the rule only moved from `prose.css` to the tool-call segment's own sheet.
  - @aparte/engine@0.15.0

## 0.14.0

### Minor Changes

- e58508a: `<aparte-chat-bubble>` reads its message role from `data-role` only; a `role="user"` / `role="assistant"` attribute is no longer honoured. If you write bubbles by hand, write `data-role` (the viewport and every wrapper already did).

  `role` is ARIA's attribute — the element sets it to `article` on itself — and reading a message role from it too meant filtering our own value back out at every turn. Pre-1.0 a rename lands as a rename, without an alias.

- ea6cfe0: `showPanel()` now mounts the panel inside any `<aparte-composer>` descendant marked `data-aparte-panel-host`. Without the marker nothing changes: the panel still goes right after the first `<aparte-composer-input>`.

  "After the input" is a position, not a choice — a layout with the input in a row and the panel meant for a block of its own had no way to say so, and a builder that lays the composer out for you needs to.

- 461a692: New `<aparte-context>`: a gauge of the model's context window. It reads each turn's reported usage and the window the current model declares (or a `window` attribute), sets `data-level` to `ok` / `warn` / `danger` at the `warn` / `danger` fractions (75 % / 90 %), fires `aparte-context-threshold` when the level changes, and with `auto-compact` dispatches `aparte-compact` on reaching danger. New in `@aparte/engine`: `createCompactionSelector({ contextWindow, systemPrompt })`, the budget-aware `compactionSelector` for `AparteClient` — the newest turns that fit stay verbatim, the rest is summarised. New locale key `contextLabel`, translated in `@aparte/locale-fr`.

  The first product built on the library showed a context badge that turned red at 90 % — and then nothing happened, because `compact()` existed, `compactionSelector` existed, the engine's compactor existed, and no piece joined them. This is the join: the gauge watches, the selector decides, and the two read the same window.

- 04289bb: `@aparte/core` now depends on `@aparte/engine` — first-party, nothing from outside `@aparte` is installed — so `npm i @aparte/core` installs both; nothing changes in how you call either package. `AparteStreamRunEvent`, `AparteStreamRunEmitter`, `AparteStreamRunOptions` and `AparteStreamRunner` are engine's `StreamRunEvent`, `StreamRunEmitter`, `StreamRunOptions` and runner shape under core's names. `@aparte/engine` no longer lists core as a peer dependency, and `createCompactionSelector` is typed structurally (`CompactableMessage`), so it takes core's messages without importing core.

  Decision D1 of the 2026-08-28 audit. The run-event contract was hand-mirrored across a "zero-import" boundary and policed by a compile-time guard that had itself been written around the one field that broke the seam; the same tool turn corrupted the history in two different shapes, one per loop, invisible to the parity suite precisely because they differ. The direction is settled: the loop is engine's, core drives it. This is the first half — the types; the inline loop's deletion is the second.

- 4bde588: A non-ok response from `AparteDirectTransport` or `AparteBackendTransport` now throws an `AparteError` with the vendor's message, `httpStatus` and a `code` read off the status; until now every one of them reached the error card and `aparte-message-error` as `UNKNOWN_ERROR`, whatever the vendor had said. A listener that matched `code === 'UNKNOWN_ERROR'` to catch transport failures should match the new codes (or the class) instead. The table: `429` → `USAGE_RATE_LIMIT`, `401`/`403` → `CONFIG_INVALID_KEY` (new code), `503` → `PROVIDER_UNAVAILABLE`, other `5xx` → `PROVIDER_ERROR`, `400` → `USAGE_BAD_REQUEST`, `408` → `NET_TIMEOUT`.

  `AparteError.from()` applies the same table to any error that carries a `status`, reads `fetch`'s network failure (a `TypeError` naming the fetch) as `NET_ERROR` — `NET_OFFLINE` when `navigator.onLine` is false — and a `TimeoutError` as `NET_TIMEOUT`; a code the caller names is kept. `AparteError.codeForStatus(status)` is exported for a provider that wants the same mapping. A `404` stays unclassified on purpose: it is a wrong model or a wrong URL, and the message says which.

- 129e094: Two chrome strings now follow the locale: the scroll-to-bottom button's accessible name (`scrollToBottom`) and the title of the message `compact()` injects (`compactionSummaryTitle`, no emoji any more). `@aparte/locale-fr` ships both.

  Both were hardcoded English in an otherwise localised transcript — a French chat compacted into a "📝 Conversation summary" header, and its one floating button was announced in English. The keys are optional on `AparteLocale`, so an existing locale package keeps compiling and falls back to English per key until it adds them. The engine compactor's own `summaryLabel` is unchanged: it is a per-call knob on the prompt side, this is the UI title.

- f9cac24: Older messages no longer reserve a row for their action bar; it floats over the message's header row on hover or focus, as a small bordered toolbar. The transcript tightens by 34px per turn. Three bars stay in the flow as before — the last assistant message's (always visible under the reply), a message's whose branch picker is showing (the bubble now stamps `data-branches` on `.aparte-message` while it does), and every bar on a device that cannot hover, where the bar is now also visible instead of sitting at opacity 0 with nothing able to reveal it. A stylesheet that positioned `.aparte-footer` or styled `.aparte-action-bar` for older messages should be checked against the new `@media (hover: hover)` rules in `bubble.css`.

  Measured on the vanilla example: 103px between the text of one turn and the next, 34 of them this footer under every message. The bar floats inside the message box rather than below it because a bubble is a paint-containment boundary (`content-visibility`), which clips anything outside.

- 0850dee: `_meta.pipeline`, `_meta.artifactRaw` and `_meta.artifactXml` are removed from `AparteChatRequest`, and with them the `pipeline-waiting` segment and engine's artifact-XML state machine. `_meta.artifactHint` and `_meta.prefixSegments` stay and are documented; an `<artifact>` tag in the reply's text is parsed exactly as before, and the built-in `create_artifact` tool is unchanged. Gone in full: `ApartePipelinePhase`, the `pipeline-waiting` segment type with its renderer, its stylesheet and `ApartePipelineWaitingSegment`, and — in `@aparte/engine` — `ArtifactXmlStateMachine`, its types and the `phase-advance` / `artifact-open` / `artifact-chunk` / `artifact-close` run events.

  Decision D2 of the 2026-08-28 audit. The multi-phase pipeline and the raw-artifact turn were one product's orchestration wearing a library type — nothing in this repository emitted either, and a contract nothing exercises is maintained for nobody. The XML mode was a second path to what the stream parser already does natively with `<artifact>` tags, kept alive by a state machine that had to be mirrored between two loops. One path is left, the parser's, and the loop no longer branches on the request's metadata at all.

- cd5075e: `AparteClient` runs `@aparte/engine`'s `runStreamAgent` by default; core's inline copy of the agent loop is deleted. One behaviour changes: a tool call stopped while it waited for approval is now marked `aborted`, never `rejected`, and a host that stops the turn from the approval panel itself no longer leaves the call stuck at `awaiting-approval`. Nothing else changes in how you call either package. `streamRunner` stays, to wrap or replace that loop (`(opts) => runStreamAgent({ ...opts, onHistoryAppend })` for a host that owns its transcript). `deriveArtifactKind` is the engine's, re-exported by core under the same name.

  Decision D1 of the 2026-08-28 audit, second half. Two copies of one loop were "kept in sync" by hand and by a parity suite; the same tool turn corrupted the history in two different shapes, one per copy, invisible to that suite precisely because they differed. The suite's 26 scenarios were snapshotted while both loops ran and were equal — the inline loop's behaviour, pinned — and now live in core, where they also hold the client's wiring to a direct engine run. That is what found the client writing `status: 'streaming'` once too often, and what dropped the change from 2 470 lines of client to 1 750.

- 95c390d: Two new tokens let a host match the chat's scrollbar to its own page: `--aparte-scrollbar-thumb` (derived from `--aparte-neutral`) and `--aparte-scrollbar-track` (transparent), beside the existing `--aparte-scrollbar-width`. A host page with a styled scrollbar of its own sets them on `aparte-chat` so the chat's does not read as a second, foreign scrollbar — the docs site does this now. Defaults are unchanged; a stylesheet that overrode `scrollbar-color` on `.aparte-viewport-container` keeps working.
- 9cf00bb: `AparteSendEventDetail` declares `modelId` and `providerId`: an `aparte-send` carrying them sends that one message to that model, overriding the config's default for the turn — a per-message model picker.

  `AparteClient` has honoured both fields for as long as it has read `event.detail`, while nothing declared them and the composer never sent them, so the capability existed only for whoever read the client's source. Declaring it is what makes it real; the generated events reference picks it up.

- 1412c54: `setSkeletonProvider`, `getSkeleton`, `AparteSkeletonProvider`, `AparteSkeletonType` and `APARTE_DEFAULT_SKELETON_FALLBACKS` are removed from `@aparte/core`, and `provideAparte({ plugins: { skeleton } })` from `@aparte/angular`. The `.aparte-skeleton` CSS recipe stays. If you registered a skeleton provider, delete the call: nothing read it.

  Nothing in core ever called `getSkeleton()` — no component has a loading state that is not the message itself, so the seam was a contract with no consumer on either side, and the six fallback strings it shipped (and their four CSS classes) were dead weight in every bundle. A consumer who wants a placeholder uses the recipe, which is the part that was real.

- 1412c54: `AparteStorageAdapter` loses its optional memory-fact, settings and artifact-gallery methods, and the `AparteMemoryFact` / `AparteArtifactRow` types are gone. `loadAttachments` and `AparteAttachmentRow` stay. An adapter that implemented the removed methods still compiles — they were optional — but the types it named have to come from your own code now.

  The shape of a "memory fact" (`identity | fact | preference | tech | project | style`, a `source` of `auto` or `onboarding`) and of a settings entry is one product's schema, not a chat library's; a public contract that carries it binds every other adapter to that product's choices. Core never read any of those methods. The contract is now exactly what the chat needs persisted — conversations, their tree, their attachments — and an app extends the interface in its own code for the rest.

- e413352: New `<aparte-suggestions>`: a row of prompt starters. Give it `suggestions='["…", {"label": "…", "prompt": "…"}]'` (or set the `suggestions` property), and a click fills the composer and submits it; `mode="fill"` only fills and focuses, `empty-only` hides the row after the first send, `target` names the chat when the element sits outside its composer. It fires a cancelable `aparte-suggestion` first. New locale key `suggestionsLabel` (the group's accessible name), translated in `@aparte/locale-fr`.

  Every chat product opens on three or four of these, and the example app hand-rolled them — four buttons, a click handler, a CSS recipe of its own. The click goes through the composer's `submit()` on purpose: that is where every gate lives (disabled, streaming, `requireModelSelection`), and a chip that bypassed them sent a request with an empty model id while the composer was visibly greyed out. The chips wear the `aparte-btn` recipe, so a theme reaches them with no knob of their own.

- 8da979c: A new CSS class, `aparte-mark`, gives a chosen row one look everywhere: an intent tint on its ground and a bar on its start edge. `aparte-mark--success`, `--danger`, `--neutral` and `--quiet` pick the intent (primary by default), and two tokens move every mark at once: `--aparte-mark-tint` (18%) and `--aparte-mark-bar` (2px). The select's chosen option, a checked field choice and the active conversation wear it; any row, option or button can.

  The recipe lives in `display/mark.css`. The bar is drawn in the intent's ink so it reads at 3:1 and above (the raw success fill was 2.27:1 on the light surface); `--quiet` is the outcome that did not happen: no tint, no bar, muted. The bar is a `::before` pseudo-element on the logical start edge, so a right-to-left row — `dir` on the document, on the row, or `auto` — gets it on the right edge. The select's chosen option keeps its look and now reads those tokens; a checked field choice (the elicitation panel's options) gains the tint and the bar beside its primary border, and keeps them under the pointer; the active conversation gains the bar (its ground stays the list's own).

  Tool-call rows: rejected and aborted no longer share the error ink — both keep the muted voice, and the glyph tells them apart (a cross for rejected, a stop square for aborted). Red stays for what went wrong.

- 1f654b0: The composer stays editable while a reply streams: the next message can be typed and files attached while the current reply arrives, as in every chat. Only the send is gated meanwhile — the button is Stop, and Enter neither sends nor stops (the draft stays and Enter sends it once the turn is over). Until now the editor and the attach button went inert for the whole turn. `disabled` still makes the editor non-editable (the `require-model` gate never did — it gates the send, and typing under it is what the browser suite checks), and a non-editable editor now leaves the tab order (`tabindex="-1"`) and drops focus, so clicking it no longer lights the shell's focus border on a field that cannot be typed in. A custom `<aparte-composer-action>` keeps its own rule (disabled while streaming), since its act is the host's.
- e58508a: The deprecated `max-messages` attribute and `maxMessages` option of `<aparte-chat-viewport>` are removed — use `max-rendered-bubbles` / `maxRenderedBubbles`, which is what the alias had been forwarding to.

  Pre-1.0 a rename lands as a rename; the alias and its one-time warning were the one deprecation shim in the package. (`AparteConversationManager`'s own `retention.maxMessages` is unrelated and unchanged.)

### Patch Changes

- 9c4ef91: Attachments under a sent message render as real tiles — the same thumbnail tiles the composer previews — instead of a bare "PDF" beside an unframed image. The attachment strip and tile rules moved from `composer.css` to the display layer (`thumbnail.css`), where a recipe shared by two components belongs.

  If you restyled the strip through `.aparte-attachments` or `.aparte-thumb…` selectors nothing changes: the class names are the same, only the sheet that declares them.

- d22a75d: `AparteClient.abort()` now stops an in-flight `compact()` without disturbing a turn, and a turn without disturbing a compaction.

  Compaction used to borrow the turn's abort controller slot, so a summarisation started during a turn left that turn unabortable — Stop reached only the summary while the reply kept streaming and kept being billed. Each has its own controller; `abort()` fires both.

- d45da0c: Changing `placeholder` on `<aparte-composer>` now updates an `<aparte-composer-input>` already on the page. `syncPlaceholder()` on the input is the method the composer calls; an input with a `placeholder` of its own is unaffected.

  The input read the composer's placeholder as a fallback when it rendered and never again, and the composer's attribute callback for it was an empty branch — so a placeholder bound to a translated string went stale on the first language switch after mount.

- 64f679a: The bubble's copy button copies the reply without its reasoning block.

  It joined every segment's content, so a reply that opened with a `thinking` segment pasted the model's deliberation above the answer. The client already keeps that block out of the history it sends back, for the same reason; the two rules for "what the reply is" now agree.

- 9c4ef91: An assistant turn that ends with nothing to show — stopped before its first token, or made only of a tool that renders nothing — no longer leaves a name and a timestamp floating in the transcript. The bubble sets `data-empty` on `.aparte-message` and the stylesheet hides the row; restyle `.aparte-message[data-empty]` if you want a "stopped" marker instead.

  Streaming bubbles are never empty (the waiting dots are their content), and attachments count as content. The element stays in the DOM, so streaming and the action bar still address it by id.

- 213add8: A code block no longer closes on a streamed chunk that merely ends in three backticks — a fence has to start a line.

  `const s = "```"` split by the tokenizer right after the quotes used to close the block mid-code, and the rest of the file streamed as prose. A reply that genuinely ends on ``` with no newline is still handled: the fence is stripped once, at the end of the stream, where it cannot mis-close anything.

- e083712: The 25 built-in glyphs and the 41 icons behind `@aparte/core/icons` are redrawn. Every name, export and size is the same — an icon provider you registered, and any `--aparte-icon-size` a container declares, are unaffected.

  They are core's own drawings, on one grid (24 units, a 2-unit round-capped stroke, `currentColor`) so the two sets keep a single optical weight side by side, and the package carries no notice and credits no icon set. The generated icons reference describes the grid and the naming rather than pointing at any particular set.

- 1589baa: Markdown tables in a reply are styled: borders, cell padding, a header row on the surface tone, and a wide table scrolls inside the bubble instead of overflowing it.

  The sanitizer had allowlisted `table`/`th`/`td` from the start and no stylesheet ever drew them, so a GFM table rendered as words with no borders and columns that touched. `prose.css` styles it like the rest of the prose, from existing tokens only.

- e3d0006: Scrolling up while a reply streams now sticks: the transcript stops pulling the reader back to the bottom.

  Auto-follow was disarmed by the gesture, but a scroll-to-bottom frame queued just before it still ran — and the bottom it reached re-armed auto-follow, so every attempt to read something above the stream lasted one frame. Queued frames now re-check the intent before scrolling. Reaching the bottom again, or pressing the scroll-to-bottom button, re-arms it as before.

- 2c67b6b: `<aparte-select>`'s dropdown panel reads `--aparte-select-dropdown-bg` in the dark theme too. Its dark rule used to repaint the panel from `--aparte-select-bg` — the trigger's background — so a transparent trigger (a pill on a coloured page) made the open list see-through in the dark, with the page's text showing through the options. The dark override is gone altogether: every colour of the select reads a token the derived layer already resolves per theme. And the trigger's label follows a list refreshed in place (a consumer writing into `.aparte-select-options`, as the model selector does): it kept showing a label the list no longer offered.
- 16464cd: `<aparte-select>` keeps one width — its widest option's — whatever is selected, like a native `<select>`; it used to resize to the selected label on every change. The trigger's label is now a grid of two layers (`.aparte-select-label-text` and a hidden `.aparte-select-label-sizer` stack of every option's label); a stylesheet that targeted `.aparte-select-label`'s text directly should target `.aparte-select-label-text`. A host that constrains the control narrower than its widest option still gets an ellipsis.
- 8d07938: On WebKit the transcript no longer settles a few pixels short of the bottom — with a scroll-to-bottom button showing — when a streamed reply ends or a branch is swapped at the bottom.

  The action bar appearing at the end of a stream and the bottom spacer giving those pixels back happen in one frame, and through that churn WebKit moves `scrollTop` backwards; a branch swap on React flickers the height by ~200px and moves it by as much. Since queued scroll frames re-read the reader's intent, those browser-made decreases read as "the reader went up" and disarmed the follow mid-landing. A decrease now counts as the reader's unless three things hold: it is no larger than the scroll height moved since the last scroll event (churn moves `scrollTop` by at most the height it changed; a reader, a find-in-page jump or a host's `scrollTo` move it with the height standing still), it comes within a second of a scroll the viewport asked for, and no scroll gesture touched the transcript in that second — a wheel notch, a touch that moves, a navigation key, or a press in the scrollbar's gutter. A click or a tap on a control inside the transcript (a branch arrow, copy) is not a scroll gesture.

- f9a6fbd: While a reply streams, the transcript is read-only except for Stop and copy: the branch pickers and the retry/edit actions of every message are disabled, and `navigateBranch()` is a no-op. Until now only the streaming message's own footer was hidden: swapping a branch on an older message re-rendered the active path under the reply being written, and a retry cut that reply off to start another. The viewport carries `data-busy` while it streams and pushes the state to its bubbles (`setTranscriptBusy()`); a bubble mounted under a framework's DOM while the flag is up reads it on connect.

  A stopped reply now reaches a terminal status on every path, so the flag comes down. Two paths did not settle the message: a stream stopped through the host (`stopTokenStream()` / a wrapper's stop left the viewport holding the message as streaming — it "kept what was streamed" but never finished it), and a Stop pressed before the first token arrived (while auth or an attachment was still being read). Either one left the transcript read-only for the life of the page. `clearAll()` clears the flag too.

- f9b1008: Four visual fixes: popovers and the select dropdown cast a visible shadow, the recommended elicitation option shows one focus ring instead of two, the bubble's action-bar buttons reach the touch-target size on a coarse pointer, and `@aparte/plugin-ask-user`'s receipt shows the answer in the strong text colour instead of green. The shadows are `--aparte-popover-shadow` and `--aparte-select-shadow` — set them yourself if you had: on cream the old one was imperceptible. The recommended option no longer shows its tinted border under the focus ring — one ring at a time. On a coarse pointer the action-bar buttons grow like the other controls already did. And the receipt's green was the one hue outside the palette on the whole transcript.
- 9592bed: On a page with several chats, an `<aparte-composer>` that belongs to none — no `target`, no chat host with an id above it — logs one warning saying how to attach it. Nothing else changes.

  Such a composer answers to every chat's lifecycle events, so one chat's Stop evicted another's open question, and the symptom sat nowhere near its cause. A signal at the console, not a guard.

- Updated dependencies [461a692]
- Updated dependencies [04289bb]
- Updated dependencies [0850dee]
- Updated dependencies [d299096]
- Updated dependencies [cd5075e]
  - @aparte/engine@0.14.0

## 0.13.1

### Patch Changes

- 73cbbdb: Fixed: the delete button's cross was invisible while you hovered it, in both themes.

  `--aparte-conv-delete-bg-hover: var(--aparte-error)` has been declared all along and never
  applied: `.aparte-btn:hover:not(:disabled)` weighs 0,3,0 and `.aparte-conv-item__delete:hover`
  only 0,2,0, so the recipe won the background. The recipe's hover rule sets no colour,
  though, so the component's `color` DID apply — the ink meant for a solid red fill, painted
  on a neutral surface. Measured in a browser: 1.17:1 on the light theme, 1.20:1 on the dark.

  Feeding the recipe its own token instead of out-specifying it is the rule the neighbouring
  sheets already follow. The red applies now, and the pair measures 3.70:1 and 4.84:1 —
  clear of the 3:1 a graphical object needs. `.aparte-conv-item__archive` had the same
  silent defect: its declared surface never applied either.

- 2391d6d: The elicitation panel gives the focus back when it closes.

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

- 3c99726: Auto-follow no longer switches itself off because the content grew.

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

- 655cdb1: A resize now re-derives the scroll-to-bottom button, so it stops getting stuck visible
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

- 73cbbdb: Fixed: six elements overflowed their container by their own padding on a page with no
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

- f8d4fae: A custom tool renderer keeps its styles when a stored conversation is re-rendered.

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

## 0.13.0

### Minor Changes

- e50ca32: A panel says whether the composer's button has an act, and a single choice settles on the click.

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

- ca49417: The five accents-as-text derive from their own fill; ten hexes become one number per theme.

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

- 82b842e: Ready-made button classes. Put `aparte-btn` on a `<button>` and it looks like every
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

- 7713818: The masters now reach the component tier, which is what makes them masters.

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

- 466b849: The rest of the stylesheet joins the token system — and the artifact panel starts
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

- 96c23c3: The stylesheet becomes a token system: one owner per value, and three masters that
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

- 3889d8f: One value for "this control is disabled": `--aparte-disabled-opacity`, default `0.5`.

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

- 13ec8ca: Every element now carries its own documentation, and the docs site is generated from it.

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

- 14a55b0: New entry point: `@aparte/core/icons`, with 41 glyphs core itself never draws.

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

- 3e2afee: Every glyph the library draws now lives in one place, `src/icons/glyphs.ts`, and each is
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

- 53d99d8: `<aparte-icon>` — the icon set, reachable from markup.

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

- a2274be: Every intent has a named ink, and core works it out when you do not.

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

- aaf8d5c: A neutral UI layer: ready-made classes for every native HTML control, plus the display
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

- 9a1471e: The scroll-to-bottom button is `aparte-btn--lg aparte-btn--circle` and stops redrawing
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

- a8804ee: Five segment types that were public in everything but name are now exported.

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

- 45a1083: Three pairs of tokens holding one value, and two rules written twice.

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

### Patch Changes

- 1dff98c: The approval panel's options and the elicitation panel's checkboxes and radios now use
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

- b011416: Fixed: `_meta.artifactHint` did nothing on a non-streaming reply.

  The hint promotes a reply's first code fence to an artifact. The streaming path applies it
  twice — as the fence closes, and again at finalize — and the path for a transport whose
  `chat()` resolves a plain string applied it never. The same reply therefore rendered
  `text | code | text` through core's inline loop and `text | artifact | text` through the
  engine seam: one response, two products, decided by which transport happened to be wired.

  That is the class of defect the engine parity suite exists to prevent, and it missed this
  one because it never pairs a hint with a plain-string reply. Two tests now do.

- 7d11d0b: Fixed: the artifact card's primary button failed WCAG AA on its own label.

  `.aparte-art-file__btn--primary` re-declared the fill, the border and the ink that
  `aparte-btn--primary aparte-btn--solid` already paints. Five of those declarations were
  inert duplicates; the sixth was not. `color: var(--aparte-text-inverse)` overrode
  `--aparte-btn-on-intent`, which the recipe derives from the fill — measured in a browser
  on the built stylesheet, 3.54:1 against the recipe's 5.27:1 in the light theme. It was
  also the last rule in `styles/` forcing `--aparte-text-inverse` as ink on a coloured
  fill, so a one-attribute rebrand re-derived the ink on every other solid-primary button
  and, here alone, kept core's own palette.

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

- 67d8e6b: Two the recipe sweeps missed.

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

- 94b87b7: The branch picker announces its move to a screen reader.

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

- 705e847: `<aparte-chat-bubble>`'s example now shows a branch.

  The element's `@example` had a plain bubble and a streaming one, and nothing with
  siblings — so the `‹ 1 / 2 ›` picker, which is what retry-forks-a-sibling produces and
  the whole subject of the branching guide, was never rendered anywhere on the docs site.
  `setSiblings(count, index)` is a METHOD, not an attribute, so no amount of markup could
  show it; the example needed the same small `<script>` the viewport, select and
  conversation-list examples already use.

  This is the source the docs read: the element page prints the example and its live
  preview runs that same string, so one addition gives both a picture of a branch.

- 682a837: A button's size modifier now moves its icon with it. `--aparte-btn-icon-size` was a
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

- ec309ab: The checkbox draws a checkmark, and a control sits on the line of text it labels.

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

- 1d336d1: The two disclosure chevrons are the icon set's glyph instead of a hand-drawn CSS triangle.

  The tool-call summary and `<aparte-optgroup>` each drew their arrow with a zero-size box
  and four borders. That is not a style choice, it is a second icon mechanism: `expand`
  already exists in `glyphs.ts`, and a consumer who registers an icon provider replaced
  every other arrow in the library while these two stayed put. They now render
  `getIcon('expand')` like the rest, so the provider reaches them, and the open state
  rotates 180° rather than 90° because a chevron and a triangle do not turn the same way.

- f0b9141: `<aparte-composer>`'s `setValue()` now reaches the editor, so it prefills the visible
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

- 1dff98c: Fixed: the approval panel's options rendered as 44x44 squares with their labels
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

- cbfc72e: Nine more class families show themselves, and tiles in a row line up.

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

- 4b80eab: Fixed: `setIconProvider` did not reach six of the glyphs core draws.

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

- 0d68e65: The examples in the docs' live frames render something.

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

- 2bf55e1: Three elements now document themselves with markup that runs, and one no longer shows
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

- 2ed3bc8: Fixed: a conversation row's label fell below WCAG AA the moment you hovered it.

  The row rests at `--aparte-text-muted`, which is right on the shell's ground. Hover moves
  the ground up to `--aparte-surface-3` and the muted ink stayed where it was: 4.23:1 in the
  light theme, computed from the two hexes — an AA failure on body text, on the one row the
  pointer is over. It takes the active colour on hover now, the same value the selected row
  already uses, which measures 12.13 light and 11.71 dark.

- 95de449: Fixed: `@aparte/core/icons` shipped without types for consumers whose TypeScript
  resolves the classic way.

  `tsc` mirrors the source tree, so a nested entry emitted `dist/icons/index.d.ts` while
  Vite emitted `dist/icons.js` beside it. The package's `exports` pointed `types` at the
  nested path and both `publint` and `attw` passed on that — but a resolver that looks for
  a declaration file NEXT TO the JavaScript found none and fell back to `any`. The entry
  is flat now, so `dist/icons.js` and `dist/icons.d.ts` are siblings and every resolution
  mode agrees.

  Caught by the docs' own snippet check, which typechecks every code fence: it is such a
  consumer.

- a574dfa: The light theme's status colours failed WCAG AA wherever they were TEXT, and the dark
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

- 7f4e396: Fixed: the keyboard could not archive or delete a conversation — both keys selected it.

  `<aparte-conversation-list>`'s row is a `role="button"` div, so the component supplies
  Enter and Space for it. That handler climbed to `closest('[data-conv-id]')` from whatever
  was focused, so a press on the Archive or Delete button inside the row found the ROW,
  called `preventDefault()` — cancelling the button's own activation — and clicked the row.
  Both controls were reachable by Tab and neither could be operated: WCAG 2.1.1, on the two
  destructive actions in the list.

  The synthetic activation now stays on the one element that has no native one. An earlier
  fix had given both buttons `tabindex="0"` and a test asserting it; focusable is not
  operable, and that test only ever proved the first half. It proves both now.

- 9a1471e: Fixed: ten documented `@cssprop` knobs did nothing.

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

- 61e40da: The custom-elements manifest now describes every public method, and stops describing
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

- b7f5bab: Three leftovers in `segment/tool-call.css` and `components/composer.css`: a
  `font-size` on `.aparte-tool-state` declared a second time thirty lines below the first,
  a comment pasted twice verbatim, a reference to a rule that had moved to another sheet,
  and `aparte-composer-attachments` declared as two rules fifteen lines apart repeating
  `display` / `flex-wrap` / `gap` at identical values. Nothing rendered differently — the
  later block simply owned those properties, so editing the earlier one changed nothing.
  One rule each now.
- 5cfb818: One rotation, and every stylesheet in one place.

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

- e50ca32: The elicitation panel's "Other…" row lines up with the options above it.

  It is a choice row and was missing `aparte-field-choice`, the recipe every sibling row
  carries — so it had no `display: flex` and its control stacked ABOVE its own label while
  the options above it sat inline. It had no focus outline either, for the same reason: the
  recipe carries that too.

  Visible in a question with the free-text escape enabled, which is the default. Found by
  looking at a screenshot of the running panel, not by reading the code.

- c236992: Fixed: every package accepted a `@aparte/core` it cannot actually work with.

  All fourteen declared `"@aparte/core": ">=0.7.0 <1.0.0"` while sitting at 0.12.1 and
  importing symbols core does not export before 0.11.0 (`AparteElementAttributes`,
  `AparteTemplateAttrs`, `AparteElementTagName`) or before 0.12.0 (`AparteUiEventName`) —
  read from `src/index.ts` at each release tag, not inferred. npm and pnpm both ACCEPT
  `@aparte/react@0.12.1` beside `@aparte/core@0.7.0`, say nothing, and hand you a tree
  whose types cannot compile.

  These packages are published in lockstep and are never tested apart, so the floor is the
  release. It now says so, and `pnpm version-packages` moves it with every bump — the floor
  went stale because the bump was the one place nothing updated it.

- 8fe68de: A streaming assistant message now renders incrementally on the plain-content path too, not
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

- bde11bb: A custom segment's `fallback` is drawn when no renderer claims its type.

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

- b9e1b1b: Every segment interface now carries an `@example`: the literal a developer would write.

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

- 8678eaf: Fixed: the default skeletons were painted with a palette core no longer uses, and a
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

- 3e2afee: The readers of core's CSS derive the sheet list from `src/index.ts` instead of keeping a
  copy of it.

  That import block IS the cascade, and two readers kept a hand-written duplicate of it.
  Both had already drifted: the derived-variable guard listed the two primitive sheets but
  would not have seen a newly added one, and the docs' CSS-variable generator had neither
  — so 269 lines of declarations were absent from the published reference with nothing to
  say so. A list that has to be kept equal to an import block is a list that will not be.

  `scripts/core-stylesheets.mjs` reads the block, in order, behind a floor.

- 7f89fc8: `aparte.css` is gone. Its 2573 lines of rules are ten sheets, one per family — `base`,
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

- 7471fb0: An error on a reply that left the active path no longer destroys what it streamed.

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

- a8ce9de: Fixed: two `role="tablist"` that announced a pattern and shipped none of it.

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

- e8506a5: The tokens move to their own sheet: `styles/theme.css` holds the light palette, the
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

- bc86198: The reasoning block wears the accordion recipe instead of redrawing it.

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

- 95fadcc: Two artifact-card buttons and one transition were missed by the sweeps that tokenised
  the rest.

  `.aparte-art-card__btn:disabled` and `.aparte-art-card__tabs button:disabled` were
  still at a literal `0.4` rather than `--aparte-disabled-opacity`, so they stayed the
  two odd ones out of the unification. They were written as one-line rules
  (`{ opacity: 0.4; cursor: not-allowed; }`), and the sweep's pattern anchored `opacity`
  to the start of a line — so it never saw a declaration sitting right after the brace.
  `transition: transform 0.2s` was missed the same way and now reads
  `--aparte-duration-slow`.

  They move from 0.4 to 0.5, in line with every other disabled control.

## 0.12.1

### Patch Changes

- 681bb47: **The branch picker no longer collapses to "1 / 1" and lose a retry fork.** In framework-managed mode — `@aparte/react`, `@aparte/vue`, `@aparte/svelte`, `@aparte/angular` — pressing ‹ after a retry could land the sibling label on "1 / 1" instead of "1 / 2". The picker then hid itself and **the other version became unreachable for the life of the page**: the fork was gone.

  The cause was not where it was first suspected. `syncRepoFromMessages` was the obvious candidate, because it syncs from the framework's array which holds the active path only — but it never deletes, it only appends and updates, so it cannot lose a tree.

  It was `_applyPendingSiblings`. It read each sibling's bubble, `continue`d past the ones not on the page yet, and then cleared `_pendingSiblings` unconditionally — so a callback running one tick early **discarded** the branch counts with nothing left to retry. The bubble arrived a moment later showing its default of one sibling.

  Which needed a framework that renders late, and they all do. React implements `afterRender` as `requestAnimationFrame(() => cb())`: a bet that the next paint lands after React's commit. It does not always, and this repo has lost that same bet before (`25f356b`, "the stream-sync flake had a cause — a bet on rAF phase").

  The fix reschedules instead of dropping, bounded at six render passes — the race needs one, and a message that has left the active path has no bubble and never will, so an unbounded retry would hold a callback forever. **It lives in the host rather than in React's rAF call**, because any binding whose `afterRender` can precede its commit hits this, and one fix there covers all four wrappers.

  Two things this was hiding behind:

  The e2e test named _"retry forks a branch and the ‹1/2› picker navigates between versions"_ asserted `toContainText('1')` — which `"1 / 1"` satisfies exactly as well as `"1 / 2"`. It never distinguished "back to version 1 of 2" from "lost a branch", and the defect sat under a green suite through four cold audits. The strict assertion now runs on **every** mode, not just native.

  And the host's unit-test harness renders bubbles synchronously inside `setMessages`, with `afterRender: (cb) => cb()` — modelling a framework that commits during the setter, which none of the four do. `pending-siblings-race.test.ts` models the real ordering and reproduces the defect without a browser.

- cd323aa: **The sanitizer's `--aparte-*` refusal can no longer be walked past with a CSS escape.**

  Core's whole theme is custom properties, so the sanitizer keeps a model-authored `--shiki-light` and refuses `--aparte-primary`: setting ours would repaint the chat around whatever element a markdown or highlight provider produced. That is defacement with the library's own paint, not highlighting.

  The refusal was spelled `!prop.startsWith('--aparte-')` and tested the name **as written**, so `--\61 parte-text` did not match and survived, and the browser decodes that ident back to `--aparte-text`.

  The asymmetry is worth naming, because it is why one of the two checks in `scrubStyle` was fine and the other was not. `SAFE_STYLE_PROPS.has(prop)` is an **allowlist**, and an escape defeats itself against one: `col\6fr` is not in the set, so the declaration dies. The custom-property test is a **denylist** — anything except ours — and an escape defeats a denylist the other way round, by making the name not match the thing being refused.

  Refused rather than decoded, which is the rule this file already applies to declaration VALUES for a stated reason: decoding is the general fix and is easy to get wrong — stripping the escape from `u\72 l(` yields `ul(`, not `url(`, which is how an earlier attempt at it passed its own test. No custom property worth setting from model-authored content needs a CSS escape.

  The fix does not rest on how any particular engine decodes anything: the invariant is that the namespace is unreachable, and it now holds because no backslash survives in a property name rather than because of a prediction about what one would become.

  Impact was bounded — custom properties inherit downward only, and `url()` / `expression()` / `javascript:` and every layout property were already refused, so this was defacement of the injected element's own subtree with no script, no beacon and no clickjack. Found by the 0.11.0 cold audit and reported as PLAUSIBLE rather than confirmed, since it rests on a spec reading no browser run was available to check; the fix is testable at our own layer, which is what made it actionable.

## 0.12.0

### Minor Changes

- 2ac6080: **Four critical defects from the 0.11.0 cold audit.** Each one is a place where two things had to agree and nothing checked that they did.

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

- 2ac6080: **Seven behavioural defects from the same audit.**

  **A tool call keeps its state word through a config change.** `relabel` rebuilt the row's badge as the icon alone, so any `setLocale`, `setIconProvider`, `registerTool` or `reset()` deleted the localized word beside it — permanently, because a settled call gets no further `update()`. "Done" went bare and pending's "Running" went empty; four of five statuses regressed. It now goes through `stateBadge`, whose own docblock claims "one function so `render` and `update` cannot disagree" and which `relabel` had never been folded into.

  **Breaking, pre-1.0: the last bare CSS class is prefixed.** The unknown-segment fallback emitted `class="segment aparte-segment-unknown"` — the rename had prefixed the second token and left the first, so 0.11.0's claim that _every_ class core emits is prefixed was false. `.segment` is Semantic UI's base layout class, which is one of the two reasons that rename happened. **If you styled `.segment`, it is `.aparte-segment` now.**

  **Three CSS rules no longer reach out of core.** `[data-status="resolved"] .aparte-tool-state` and its two siblings were the only rules in the stylesheet whose leftmost compound is an unprefixed non-element selector. A host wrapping the chat in `<div data-status="rejected">` re-tinted every completed tool call's word red. Now scoped to `.aparte-segment-tool-call`.

  **Stop in one chat no longer tears down another chat's open question.** The receive side already resolved its own chat host when no `target` attribute is set — which is all of raw core, since the documented markup sets none. The send side read the attribute only, so the abort carried `targetId: undefined`, and a missing id means "for everyone".

  **A number binding with no value no longer writes `"NaN"`.** Angular's `numberAttribute` returns `NaN` for undefined, null, `''` and any non-numeric expression, so `[scrollThreshold]="cfg.threshold"` on an unset field wrote `scroll-threshold="NaN"` — and `parseInt('NaN' || '50', 10)` is NaN because `'NaN'` is truthy, so the transcript stopped following a streaming reply and the scroll-to-bottom button never hid. `applyElementProps` removes the attribute instead, restoring the documented default. `0` still writes, because 0% is a value.

  **A CSS variable with no value is removed rather than stringified.** `props={{ '--aparte-select-bg': theme.selectBg }}` on an optional field set the property to the token `undefined` — worse than leaving it alone, because a property that is _set_ makes every `var(--x, default)` skip its fallback and become invalid at computed-value time, so the declaration is dropped and the control renders unstyled. An object became `[object Object]` the same way.

  **`@aparte/svelte`: five events are bindable again.** The `on:` surface derives from `HTMLElementEventMap`, which deliberately omits the events carrying no detail. Harmless while that only governed `addEventListener` — but declaring the tags removed `SvelteHTMLElements`' catch-all index signature, so `on:aparte-cancel` (the stop button), `on:aparte-composer-submit`, `on:aparte-reset-done`, `on:aparte-select-open` and `on:aparte-select-close` stopped type-checking. All five are Angular `@Output()`s, so the wrappers were not at parity.

  Closed by deriving from core's proxy list as well, which already enumerates every event an element dispatches on itself. `APARTE_DEFAULT_UI_EVENTS` becomes `as const` so the literals exist at the type level, and core exports the new type **`AparteUiEventName`**.

  **`@aparte/plugin-model-selector`: the framework peer ranges are fixed.** `react: "^19.2.7"` and `svelte: "^4.2.0"` were copied from the package's own devDependency pins, excluding React 18 and Svelte 5 — both supported by the matching wrappers. An out-of-range peer that is present is an ERESOLVE conflict whether or not it is optional, so installing this plugin in a Svelte 5 app failed. Now `^18.0.0 || ^19.0.0` and `^4.0.0 || ^5.0.0`, matching the wrappers.

## 0.11.0

### Minor Changes

- f52dbe9: **Refusing a tool no longer ends the turn.** The model gets a turn to answer in, so it reads the refusal.

  Before: a refusal appended a _"Tool execution was rejected by the user."_ tool_result and stopped the run — so the one sentence written for the model was never sent to it. Telling the assistant what you actually wanted meant retyping it as a new message, which it then read out of order.

  After: the turn's **remaining** tool calls are still skipped (the model may have asked for several, and refusing one cannot license the others — that part was a real fix and it stands), and then another turn runs.

  This needed one flag to become three states, because a refusal answers two questions differently: _run the calls that follow this one?_ — no; _take another turn?_ — yes. Core's `_handleToolUseEvent` returns `'continue' | 'respond' | 'halt'`; the engine's loop `break`s without clearing `continueLoop`. Both changed together, and the parity suite stayed green through it — which is the suite doing its job: it asserts the two loops agree, never what they do. The scenario named _"rejected stops the loop identically"_ had to be renamed by hand for exactly that reason.

  Two other outcomes are now visibly distinct from a refusal rather than sharing its exit: a per-tool turn limit, a missing handler, and an abort all `halt` and tell the model nothing.

  **If you depended on the old behaviour** — a refusal ending the run — refuse from an `approvalResolver` and stop the client yourself, or set `maxTurns: 1` on the tool.

- e40cf78: **Breaking, pre-1.0, no shim:** a request for the human that ends without an answer now **rejects** instead of resolving `{ action: 'cancel' }`.

  `AparteElicitationResult` loses its `cancel` arm and keeps `accept` / `decline`. The failure arrives as the new `AparteElicitationAbortError`, whose `name` is `'AbortError'` — so any handler already testing `err.name === 'AbortError'` needs no change — and whose `reason` is `'aborted'` (a stopped turn, a fired signal, a question taken away by another request) or `'no-presenter'` (nothing was mounted to ask it).

  Why the shape had to change: a value is easy to handle as though it were an answer, and that is exactly what happened one level up. The tool-approval gate read `cancel` as a refusal, stamped the segment `rejected`, and told the model "Tool execution was rejected by the user." The user had pressed Stop. A rejection cannot be mistaken for a decision by a caller that forgot a branch, which is the property `cancel` never had.

  Evidence the shape is right: `askUserHandler` already performed this exact conversion by hand — `{ action: 'cancel' }` in, `new DOMException(..., 'AbortError')` out. That conversion is gone; the error now propagates from the primitive.

  **Migrating.** Replace a `case 'cancel':` branch with a `catch`. A `switch` on `action` that had all three arms keeps compiling with two, and the third path becomes the `catch`. One consequence worth knowing: a request you start and never `await` will surface an unhandled rejection when it ends without an answer, because that is what an ignored failed promise is — attach a `.catch()` if you genuinely do not care about the outcome.

- ecd9ad5: **A tool call now shows what went in and what came out**, and it is drawn as a row rather than a badge.

  The pill named the tool and showed nothing else — not the arguments the model chose, not the result it got — while the segment carried both the whole time. Missing presentation, not missing data. It opens onto `Input` (pretty-printed JSON) and `Output`, coloured by a registered highlight provider when there is one and readable as escaped text when there is not.

  **Collapsed, always** — including while the loop waits for a decision. The reasoning block stays closed while it is being produced, which is the most live moment there is, so a tool call has no stronger claim to unroll itself. One rule, no special cases. A `<details>` appears only when there is something behind it: a disclosure onto nothing is an affordance that lies.

  **Breaking, pre-1.0: four CSS classes are renamed**, because a name in a public CSS contract must name a ROLE and not a shape — the shape belongs to whoever is styling it. `tool-pill` → `tool-label`, `tool-pill-icon` → `tool-icon`, `tool-pill-name` → `tool-name`, `tool-pill-spinner` → `tool-spinner`, `tool-pill-status` → `tool-state`. Same reasoning that retired `footer-left/center/right`: a name the design contradicts is a name that will lie.

  **And it no longer looks like a tag.** The identity is neutral at every status — it used to be filled green when a call resolved and red when it was refused, which made a finished step shout louder than the reply it belongs to. The colour lives on a small state badge at the far end, which now carries a WORD as well as a glyph (`Running`, `Done`, `Rejected`, `Stopped`): a bare cross beside a name reads as a button that removes something, so the state was being mistaken for an affordance.

  The renderer gains an `update`, which it never had. Without one the bubble replaced the element on every change — and a tool call changes status several times a turn, so a disclosure the reader opened would have slammed shut under them each time. A registered `registerToolRenderer` still owns its whole markup and is rebuilt rather than patched.

  New locale keys: `toolInput`, `toolOutput`, `toolRunning`, `toolCompleted`, `toolRejected`, `toolStopped`, translated in `@aparte/locale-fr`. New themable variable: `--aparte-tool-row-radius`.

- 56e1247: **An open request now follows a language switch.** `AparteElicitationRequest.message` and `AparteApprovalOption.label` accept `string | (() => string)`; the function arm is re-read whenever the locale changes while the request is on screen.

  Additive — a string still behaves exactly as before, and deliberately so: a plain string is treated as the host's own wording and left alone. That is right for an app's text and wrong for locale-derived text, which is why core's own approval gate now passes functions.

  The gate was asking `Run delete_file?` over buttons reading `Approuver` and `Rejeter`. `approveTool` and `rejectTool` have been translated in `@aparte/locale-fr` since long before this: nothing was missing from the translations, the re-read path was missing. It existed while the buttons lived in the segment, and moving them to the composer left it behind.

  The tool's NAME is substituted into the question and never translated — it is the identifier the model called, wire format, so only the frame switches.

- 094d438: **The tool-approval decision moves out of the transcript and into the composer.**

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

- 5ac31ff: **Every CSS class core emits is now prefixed `aparte-`.** Breaking, pre-1.0, no aliases: 42 names across 291 occurrences.

  `aparte-segment` `aparte-segment-content` `aparte-segment-text` `aparte-segment-thinking` `aparte-segment-code` `aparte-segment-error` `aparte-segment-tool-call` `aparte-segment-artifact-card` `aparte-segment-artifact-file` `aparte-segment-pipeline-waiting` `aparte-segment-unknown` · `aparte-tool-summary` `aparte-tool-toggle` `aparte-tool-label` `aparte-tool-icon` `aparte-tool-name` `aparte-tool-spinner` `aparte-tool-state` `aparte-tool-detail` `aparte-tool-part` `aparte-tool-part-label` `aparte-tool-part-body` · `aparte-code-content-wrapper` `aparte-code-copy` `aparte-code-filename` `aparte-code-header` `aparte-code-header-filler` `aparte-code-language` · `aparte-error-content` `aparte-error-details` `aparte-error-icon-wrapper` `aparte-error-message` `aparte-error-title` · `aparte-thinking-content` `aparte-thinking-header` `aparte-thinking-label` `aparte-thinking-toggle` · `aparte-is-streaming` `aparte-is-focused` `aparte-is-dragover` `aparte-has-content` · `aparte-pw-dot`

  If you style any of these, add the prefix. `--aparte-*` custom properties are unchanged — they were already namespaced.

  **Why it mattered in both directions.** Core is light DOM on purpose: no shadow root, so every selector reaches in and out. Inbound has bitten this project twice already — a bare `nav { justify-content: space-between }` on aparté's own docs site pushed the artifact card's tabs to opposite ends, and `.segment` is Semantic UI's base layout class. Outbound is the worse half and was never stated: these were **bare global selectors**, so `@aparte/core` shipped a rule for `.error-message`, `.code-header` and `.thinking-header` onto the whole page. Almost every site has an `.error-message`.

  The component classes were already prefixed (`aparte-message`, `aparte-composer-row`, `aparte-approval-option`, `aparte-elic-panel`); the renderer classes never were. With no written policy, the split held at 146 to 42. The policy is now in CLAUDE.md.

  One deliberate exception: `language-*` on a code block stays unprefixed, because that is the class name highlighters look for.

  Removing the `progress` segment in the same release already took out `progress-bar` and `progress-fill`, which are Bootstrap's.

- c4d87a2: A second request for the human now **waits** instead of being answered `cancel` on arrival.

  `AparteConfig.requestUserInput` holds a queue, so one request reaches the presenter at a time. That limit is real — the composer has one panel slot, and a second request used to clobber the first's DOM — but the old protection lived in `<aparte-elicitation>`, which resolved the second request `{ action: 'cancel' }` immediately. That is a refusal invented for a question nobody was ever shown, and the model reads it as the user having refused. Waiting is the honest behaviour.

  Two things this also fixes: a consumer's own presenter, registered with `setElicitationPresenter`, previously had no protection at all; and a request that has been queued while its turn is stopped is no longer presented, because asking about a run that is already over asks about nothing.

  Filed minor rather than patch for one reason worth naming: code that leaves a request unawaited and then awaits a second one used to get an immediate `cancel` and now waits for the first to settle. Nothing in this repo did that, and a dangling request is itself settled by the composer's turn-end eviction, but the shape of the change is visible enough to be a minor.

  The queue only costs a microtask when something is actually ahead: with nothing waiting, a request is still presented in the calling tick, which is what the panel being mounted synchronously depends on.

- c6d3a20: **The `progress` segment is removed.** `AparteProgressSegment`, `progressRenderer`, its registration in `registerDefaultRenderers()`, its CSS and its three `--aparte-progress-*` variables all go. Breaking, pre-1.0, with no alias and no shim.

  No language model emits a progress bar. Not chat-completions, not Anthropic's messages API, not the AI SDK's stream protocol — a model emits text, reasoning, tool calls, tool results and sometimes citations. And nothing in this repo emitted one either: the only in-repo `'progress'` is a worker→main message in `@aparte/provider-transformers` reporting **model download** progress to an `onProgress` callback, which is a name collision and never a segment.

  `label` + `percent` + `status` are the signature of an app that owns the work — word for word the reason the `terminal` segment was removed, and the sixth segment type to go for it. The line it sits on the wrong side of is visible one file away: `pipeline-waiting` stays, because **core emits that one itself** between the phases of a multi-step turn. Core-owned indicator, not app-owned data.

  An app that wants a progress bar has the seam for it: `registerSegmentRenderer` with a segment type of its own. That is the same answer this library gives for a terminal, and it is a better one than a built-in nothing fills.

  Also fixes the landing's hero, which claimed "ten kinds of content" over a list of eight. The count is computed from the list now, so it cannot drift again; it reads seven.

- 9e30879: **Every aparté element now has a typed surface in all four frameworks.**

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

- 2f6180e: **A wrapper types only what it depends on.** `AparteModelSelectorDirective` and `AparteAskUserDirective` are removed from `@aparte/angular`; `aparte-model-selector` and `aparte-ask-user` are removed from core's `AparteElementAttributes` registry, along with the `AparteModelSelectorAttributes` export; and `aparte-model-change` is removed from `APARTE_DEFAULT_UI_EVENTS`.

  They were added hours earlier in the same release, and the reason to take them back out is the one that matters: **a third-party plugin's author cannot add a line to `@aparte/core`.** Typing our own plugin's element from core and shipping its directive from the wrapper gave aparté's packages a privilege nobody else's plugin could have — an asymmetry baked into the library before it has an ecosystem.

  The rule that replaces it is symmetric and states in one line: **whoever owns the element owns its contract and its bindings.** Core's elements are typed by core and wrapped by the wrappers. Everything else — a plugin's element, ours or yours — is typed by its owner, or in six lines by the app that places it. Both mechanisms are documented, and both are exactly the same work for us as for anyone: module augmentation for React/Vue/Svelte (types only, no runtime, applies exactly when the package is installed) and a directive for Angular, whose only non-obvious part — attribute versus property — is `applyElementProps`, already exported.

  Nothing about core's own 18 elements changes: their attributes, the 26 declared events with 20 typed details, the JSX/Vue/Svelte typing and the 17 Angular directives all stay.

  The Angular example keeps its `CUSTOM_ELEMENTS_SCHEMA` removed.

  _Amended after release:_ this said the example "now declares its own six-line directive for the model selector instead of importing one". It does not — it imports the directive from `@aparte/plugin-model-selector/angular`. The plugin shipped that subpath later in the same release and the example was switched back to it, but this paragraph was not re-measured before publishing. The pattern itself is documented, with a worked example, at `/frameworks/elements/#your-own-element-or-a-plugins`.

### Patch Changes

- 7336ae4: **A built-in renderer's CSS moved out of `getStyles()` and into `styles/aparte.css`** — the tool call, the artifact card and the pipeline-waiting segment, 425 lines out of the three
  renderers and 449 into the stylesheet (the difference is section comments and blank lines a real
  stylesheet gets to have). No visual change: the same rules, in a file that ships the same way.

  `getStyles()` stays on the renderer interface, because that seam is what a _consumer's_ renderer needs — something registered through `registerSegmentRenderer` or `registerToolRenderer` cannot edit core's stylesheet and has no other way onto the page. A built-in has the stylesheet.

  Two measured reasons. `check:derived-vars` reads that one path and nothing else, so a declaration deriving from another variable could hide in a renderer unchecked. And CSS in a template literal is not read as CSS: a backtick closes the literal — the artifact card's own comment recorded that happening, and it happened three more times in one sitting, the worst rendering a source marker into an assistant's bubble as prose, because inside a template literal a `//` comment is just text.

  Also removes a dead rule that tinted the tool row's border while a decision was pending: it stopped painting anything when that border went away in the row redesign, and it reached for `--aparte-border-strong`, a variable that was never declared anywhere.

  Contract-neutral: core's entry imports the stylesheet and `package.json` marks every `.css` a side effect, so importing `@aparte/core` has always brought it along.

- 02f2d4d: The composer's one panel slot now has an owner, which closes a defect that could permanently stop a chat from asking anything.

  `showPanel` returns a token and accepts an `onEvict` callback; `hidePanel(token)` closes the panel only if that token still owns the slot. Both additions are additive — code that calls `showPanel()` and `hidePanel()` as before is unchanged.

  The defect: the composer tears its panel down on **every** turn-ending event, and `<aparte-elicitation>` only listened for `aparte-message-error` and `aparte-message-aborted`. A question still open when a turn completed normally therefore lost its panel while the presenter kept its pending state — so `requestUserInput()` never settled, and because the presenter refuses a second request while one is pending, every later question was short-circuited for the life of the page. One finished turn and the chat could never ask again.

  Three paths could close a panel whose owner was still awaiting an answer, and none of them told the owner: a second `showPanel`, the owner's own late `hidePanel`, and the turn-end teardown. All three now notify, and a presenter settling late can no longer tear down the panel that replaced its own.

- 093a196: **The element bindings are generated from the manifest, not written by hand.** 675 lines of
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

- e406a98: **Every element now declares and describes its own surface**, and the generated API reference prints each event's detail type.

  The manifest is the source of truth for the component API, and it was quietly incomplete. Four elements carried a full `@element` / `@attr` / `@fires` block at the top of their file, separated from the class by imports and interfaces — TypeScript associates only the comment physically adjacent to a declaration, so every authored description was dropped on the floor. Nothing _looked_ missing: the analyser reads `observedAttributes` and `this.dispatchEvent` structurally, so `<aparte-select>` still listed six attributes and three events. They just had no text, and the reference page shipped rows like `| aparte-cancel |  |`.

  Seven event names reached the manifest through neither path and are now declared by hand, because no docblock fix can make them detectable: the analyser's fallback only visits real method declarations and only recognises `this.dispatchEvent`. `<aparte-conversation-list>` had **no events at all** — all four of its dispatches happen in an arrow class field. `<aparte-chat-bubble>` was missing exactly one, `aparte-branch-navigate`, for the same reason. `<aparte-composer>` was missing `aparte-abort` and `aparte-message-aborted`, which go out on `window`.

  Every event that carries a detail now names its type — `@fires {CustomEvent<AparteConversationSelectDetail>} …` — sourced from `event-map.ts`, which is guarded in both directions. Before this, all 26 events in the manifest read as a bare `CustomEvent`; there was no working typed instance in the repo. The generated reference gained a **Type** column to print it, because that is what tells a consumer the shape of `e.detail`.

  Result: 18 elements, every one with a description, every attribute and event described, 26 events of which 20 carry a typed detail.

- 6f262cf: Three fixes to the human-in-the-loop gate. No API changes: nothing that compiles today stops compiling.

  **A stop is no longer reported to the model as a refusal.** Pressing Stop while a tool waited for approval stamped the segment `rejected` and put "Tool execution was rejected by the user." into the history — the sentence the model reads named a decision nobody made. The abort path resolved `{ approved: false }`, the same value an explicit Reject produces, so the gate could not tell them apart. It now asks the signal instead of the value, and an aborted wait stamps `aborted` and appends no `tool_result`: there is nothing true to tell the model, which is already how a handler aborted mid-run is treated.

  **A `needsApproval` tool with no `approvalResolver` aborts instead of inventing a refusal.** `runStreamAgent` defaulted to `async () => ({ approved: false })`, so a host that had simply forgotten to wire a resolver was reported to the model as having refused.

  **A reloaded conversation stops waiting for a decision nobody can give.** A `tool_call` persisted as `awaiting-approval` came back still awaiting it, with Approve / Reject buttons wired to a listener that went with the page — and `isSegmentSettled` reads _status_ for a tool call, so the segment also stayed open and collected an `endedAt` from the next turn-close. `adoptSegment` now normalises it to `aborted` on every load path: nobody refused it, the page simply went away. The persistence guide documented this as something core could not fix for you; that half of the paragraph is gone, and `pending` — the same defect on the sibling nobody had looked at — is named as still outstanding.

  **`AparteToolDecisionDetail.targetId` is declared.** The runtime always sent it and a test read it, so reaching the chat id on a public event required casting past its own type.

- d85cf6b: **`APARTE_DEFAULT_UI_EVENTS` now lists every event an aparté element dispatches on itself** — 23 names, up from 7.

  This is the set `AparteUi` forwards in all four wrappers, so an event missing from it is an event a consumer cannot hear through the proxy. It described itself as "verified against core" while carrying seven of twenty-three, and the gap was not academic: `aparte-model-change` was absent, and `<aparte-ui name="aparte-model-selector">` was the one worked example in the wrappers' own documentation — the documented usage could not receive the event it exists to receive.

  That example is gone from this release for a better reason than a longer list: `@aparte/plugin-model-selector` now types its own element and ships its own bindings, so its event is typed through the DOM and the proxy is not on the path at all. `aparte-model-change` is therefore _not_ in this list — a plugin's event is the plugin's to declare, and core listing it was the same privilege the boundary change removed everywhere else.

  Two of core's own events are also deliberately excluded: `aparte-abort` and `aparte-message-aborted` go out through `window.dispatchEvent`, so an element-level listener can never receive them and listing them would promise a forward that cannot happen. That is the whole difference between the manifest's 25 distinct event names and this list's 23.

## 0.10.0

### Minor Changes

- b4f2435: **Fixed: a derived CSS variable now follows a master you override.** Per-instance
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

- fd192e6: **A config change now reaches the composer, and `subscribeConfigChange` is the hook for your own elements.**

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

- 0fc38d8: **A live config change now reaches an open question and the model selector.** They were
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

- cd188f7: **The language lever, finished: four more strings, and the clock.** Additive — five new
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

- 3f182ef: **Eight strings that could not be translated in any language now can.** Additive: five
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

- 494e3dd: **Removed: the `file-tree` segment type.** Breaking, deliberately and without a shim.

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

- 0fed195: **Removed: the `terminal` segment type, with its event and its host handler.** Breaking, pre-1.0, no shim.

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

- 155a619: **Removed: the `diff`, `image` and `preview` segment types.** Breaking, pre-1.0, no shim.

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

- 88cc99a: **New: `relabel` on `AparteSegmentRenderer` — a config change now reaches the text inside a rendered segment.**

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

- 9ac83d4: **A segment's measurements move from its own fields into `meta.aparte`.** Breaking,
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

- 7602c8d: **A reasoning block is closed by default, and any segment type can be given defaults.**
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

### Patch Changes

- f1fcbb4: **The artifact card's tab row and its heights.** Three things, all reported from the
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

- 388b594: **Fix: any config change made avatars appear across the transcript, and switching back did not remove them.**

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

- 79956cb: **A bubble with nothing to paint no longer paints a box.** Reported from the page: send
  a file with no text, and the message showed an empty coloured rectangle under the chips.

  `.aparte-message-content` carries the user bubble's background, padding and radius, and
  the attachment chips render **above** it, outside it. So a message that is only
  attachments left that box with no content, no segments and no waiting dots — and it drew
  itself anyway.

  It is hidden now when it is empty **and not waiting**, which is the whole rule: the
  assistant's typing dots live inside that same box, and a fresh streaming bubble is empty
  by definition. Hiding on emptiness alone would have taken the typing indicator with it —
  asserted, not assumed.

- 9642713: **A syntax highlighter's dual-theme output is no longer thrown away.** The default
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

- fbffb48: **Fix: a message appended with its segments already populated wrote every streamed chunk twice, and its segments were never stamped.**

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

- fc8a83b: **Fix: the stop button's accessible name was never translatable, in any language.**

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

- 4ce2ae6: **A code block is coloured while it streams, not after it.** Reported from the screen: an
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

- 17d31fb: **An SVG artifact with only a `viewBox` now previews.** It showed a blank frame.

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

## 0.9.0

### Minor Changes

- 216c5f0: **A segment now knows where it sits and when it happened.** `AparteSegmentBase`
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

## 0.8.0

### Minor Changes

- c33d2b0: A fourth cold audit: two CRITICALs, fourteen MAJORs, and the guards that let four of them in

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

- 688a231: Remediation of a from-scratch audit: four CRITICAL and nineteen MAJOR defects, plus the
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

- 7d6652a: A third cold audit, and the one CRITICAL it found

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

- d3e482c: The question panel: right chat, readable schema, replaceable field

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

- 1603015: No tool ever reached the model, and three smaller things a first test session found

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

- 950261d: The `<artifact>` XML streamer is a file, and its twin no longer disagrees with it

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

### Patch Changes

- c87d2b2: `@aparte/plugin-ask-question` is now `@aparte/plugin-ask-user`, and the tool is `ask_user`

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

## 0.7.1

### Patch Changes

- 4a180af: The composer no longer sits flush against the bottom edge of the chat.

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

## 0.7.0

### Minor Changes

- acb1e37: **Breaking:** the composer's three positional footer slots become one `toolbar`.

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

## 0.6.1

### Patch Changes

- 2075f9b: README fix: the npm page announced "🚧 **Pre-alpha** — not yet published to npm" —
  false on the very page npm was serving, and it had been through four releases. It now
  states what the package is (alpha, plain `0.x`, lockstep, API can still change) and
  links the changelog.

  The quick start went with it: it showed `registerDefaultRenderers()` as a required
  step (the built-ins install themselves since 0.5.0-alpha.0) and stopped before the one
  line that makes the retry/edit buttons appear now that they ship off. It also pointed
  at the docs _sources_ in the monorepo rather than at apartejs.dev.

- 0c4c0e3: **Fix: a locale switch now reaches the components already on screen.** The docs say
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

- 6e0211c: **Fix: refreshing a live option list no longer throws away the keyboard position.**

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

## 0.6.0

## 0.5.0-alpha.0

### Minor Changes

- cd7adfc: **Only the affordances core can honour end-to-end are enabled by default.** A button
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

- 3edb766: **The built-in segment renderers install themselves the first time a segment needs
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

### Patch Changes

- 3b026bb: **Fix: streaming a segment with `appendToSegment` wrote every chunk twice** — in the
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

## 0.4.0-alpha.0

### Minor Changes

- 50d90a8: **The waiting state now exists.** Between "user sends" and the first token there was a bubble
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

- cda5f54: `<aparte-chat>` gained an **`attachments`** attribute: it adds the file picker
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

- e9909c6: New exported helper `filesToAttachments(files)`: turns the `File[]` an
  `aparte-send` event carries into the `AparteAttachment[]` a bubble renders (id,
  MIME type, object URL, and the raw `File` kept for storage adapters).

  This conversion already existed inside `ConversationController`, so framework
  wrappers had it — but a raw-core consumer driving `appendMessage()` itself had to
  hand-roll object URLs, and silently rendered attachment-less bubbles if it
  didn't (the vanilla playground did exactly that). The controller now uses the
  same helper, so there is one implementation.

### Patch Changes

- 358bc53: `appendToSegment` no longer costs a full framework render per token. It used to
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

- 801622a: Swapping a branch no longer conjures a scroll-to-bottom button on a transcript you are
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

- 0d4945f: Two attachment-rendering fixes in the message bubble:

  - **Alignment**: a user message's attachment strip was anchored to the trailing
    edge while the user bubble hugs its text on the leading edge — one message
    split across both sides of the transcript (a chip on the right, the text
    bubble on the left). The strip now shares the bubble's edge.
  - **Standalone `appendMessage()`**: the viewport created the bubble from
    attributes only, silently dropping the message's `attachments`, `segments`
    and `usage`. It now runs the same `populateBubbleFromMessage` sync the
    framework-managed path uses, so an imperatively appended message renders in
    full (bring-your-own-loop consumers were getting text-only bubbles).

- de57a6a: Fix a pending assistant bubble showing its action bar (copy/retry) and no busy
  state in every framework wrapper. A wrapper creates `<aparte-chat-bubble>` with
  its attributes already set, so `streaming` arrived _before_ the element rendered
  its inner DOM — and `_updateStreaming()` had no `.aparte-message` to write to, so
  `data-streaming`, `aria-busy="true"` and the class that hides the footer were
  silently dropped for the whole turn. The state is now re-applied when the inner
  DOM is built.

  Visible effect: an empty, still-streaming reply no longer offers Copy/Retry, and
  screen readers get `aria-busy` while the answer is being generated.

- af5ed3d: `@aparte/core` now declares `sideEffects` (it was the only one of the 14 packages
  without it, so bundlers had to treat every module as side-effectful and could not
  tree-shake it). The browser entry and the CSS are listed as effectful — they define
  the custom elements — and everything else, including the DOM-free Node entry, is
  pure.

  The README gains a **Node / SSR** section: the `node` export condition, what the
  server entry keeps (client, host, transports, `createAparteChatHandler`, runtime,
  types) and what it drops (the custom elements, with `registerAllComponents()` a safe
  no-op). The capability already existed and was invisible — reading `src/index.ts`
  shows the _browser_ entry, which is how a consumer concludes the opposite.

- 2336bc5: A partial `AparteIconProvider` no longer breaks the bubble action bar. `getIcon()`
  always fell back to the built-in SVGs for icons a provider didn't implement, but
  `getIconProvider()` — what the action bar reads, calling each icon directly —
  handed back the registered provider verbatim, so a provider covering only some
  icons threw `icons.retry is not a function`. It now returns a complete set,
  falling back per icon.

  Consequently every key on `AparteIconProvider` is now optional, which is what the
  runtime always supported (and what the interface's own example showed). Full
  providers keep type-checking unchanged; partial ones stop needing `as any`.

- 79b2795: Accessibility fixes in `<aparte-select>` (and therefore the model selector), all
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

- 9f839e4: Fix send routing when several chats share a page. `AparteClient._handleSend`
  resolved the event's `targetId` by requiring `appendMessage` **on** that element,
  but an `<aparte-chat>` shell owns no `appendMessage` — it delegates to its
  `.viewport`. Every `target`-attributed send therefore logged a warning and fell
  through to a DOM scan that returns the _first_ chat on the page, so with two
  chats mounted one chat's reply rendered inside the other. Send now uses the same
  resolver as retry/edit (which had already been fixed for this).
- 80995ea: `injectTokenStream` / `streamTokens` now keep the framework's message list in sync. They
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

- 118d4fb: Editing a message now updates the bubble that shows it. `AparteChatViewport`
  forwarded an atomic `updateMessage()` to the rendered bubble only when the
  payload carried `status` or `segments`, so an edit — which sends `{ content }` —
  updated the message repo (and therefore the history sent to the model) while the
  transcript kept displaying the old wording. `content`, `attachments` and `usage`
  updates are forwarded too now.

  Standalone/raw-core consumers were affected; framework wrappers re-render bubbles
  from their own state, which masked it.

## 0.3.0-alpha.0

### Minor Changes

- d4c448b: New `fileInjectFilter` on `AparteClientOptions`: a per-file veto on top of the
  `rawFileInject` mode. Called for each attached file the mode would inline into
  the request; return `false` to keep it out (the file still rides on the
  `aparte-send` event for the application layer). Lets a host keep the default
  inline UX while blocking sensitive names (`.env`, keys, certs).
- 7227dee: New `AparteConfig.resetLocale()`: restores the built-in English locale after a
  `setLocale(...)` call, without having to import `DEFAULT_LOCALE` yourself.
  Notifies mounted components like every other live setter.
- 7227dee: `AparteAIProvider.getModels()` is now typed **synchronous-only** (`AparteAIModel[]`).
  The `Promise<AparteAIModel[]>` form was silently ignored by `getCurrentModel()`: an
  async provider lost its capability list (e.g. `function_calling`), which disabled
  tools with no error or warning. Async model fetching belongs in `fetchModels()`
  (consumed by `AparteConfig.refreshProviderModels()` and the model-selector).
  Plain-JS consumers that still return a Promise now get an explicit `console.warn`
  instead of a silent failure. All bundled providers already complied.

### Patch Changes

- 0192d63: `injectTokenStream` / `stopTokenStream` now carry real JSDoc on the canonical
  `AparteChatImperativeApi` (shipped in the `.d.ts`, so it surfaces in every
  wrapper): the viewport auto-creates a missing assistant message internally
  only, so wrappers should `appendMessage` explicitly before injecting. A new
  "Bring your own loop" docs guide covers the display-only mode end to end.
- 622dc78: `<aparte-select>`'s combobox trigger now carries an accessible name (axe
  `aria-input-field-name`, serious): the host's `aria-label` when provided,
  falling back to the `placeholder`. Screen readers previously announced the
  model selector as an unnamed combobox.

## 0.2.0-alpha.0

### Minor Changes

- 930a108: Harden the server-side `createAparteChatHandler`: add an optional `authorize(req)` gate
  that runs before any work (return `false` for a 401, a `Response` for a custom rejection,
  or `true` to proceed) so you can put auth in front of the key-spending `/api/chat` route,
  and guard the vendor URL build against an adapter returning a non-rooted request path
  (SSRF) by rejecting anything that isn't a single-rooted path.
- 4aac26d: Add the `<aparte-chat>` shell — the container element for a chat. Wrap a viewport
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

- a2ed74b: Ship clean inline-SVG default icons (copy, retry, edit, send, thumbs up/down, and
  the rest) in `DEFAULT_ICON_FALLBACKS`, so the chat looks right out of the box with
  no icon plugin — still zero runtime dependencies, since an inline SVG is just a
  string. Override any icon via `setIconProvider` with any HTML (SVG, an icon-font
  `<i>`, an emoji or an `<img>` — the value is treated as trusted markup).
- a6ed936: One canonical imperative contract for `<AparteChat>` across the four wrappers.

  `@aparte/core` now exports `AparteChatImperativeApi` — the ~20-method surface every
  framework handle delegates to `AparteChatHost`. React's `AparteChatHandle` and
  Vue/Svelte's `AparteChatInstance` are now type aliases of it, and the Angular
  component `implements` it, so any per-wrapper drift (a missing or mistyped method)
  is a **compile error** instead of a silent divergence.

  **Angular parity:** adds the imperative `setConversationId(id)` method (the
  `conversationId` `@Input` remains the declarative path), closing the one gap where
  Angular's handle differed from the other three.

- 7157ad5: Unify every custom DOM event to one kebab-case convention and type it.

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

- 69525ad: Zero-dependency web components for AI chat: bubble, composer, viewport,
  conversation list, and elicitation, with a transport seam (`DirectTransport` /
  `BackendTransport`) and a customization surface (render hooks, action registry,
  theming via CSS custom properties). Ships ESM plus a Node/SSR-safe entry and a
  custom-elements manifest.
- d31f681: Give the base chat container layout to both host shapes core already recognises,
  from one rule. Core resolves the chat host via the selector
  `aparte-chat, [data-aparte-chat]` (the vanilla `<aparte-chat>` element and the
  `<div data-aparte-chat>` roots the framework wrappers render); the base
  flex-column layout (fill the parent, viewport scrolls internally, composer pinned
  to the bottom) now keys on that same selector in `aparte.css`. This fixes React,
  whose wrapper container previously had no base layout, and lets the Vue and Svelte
  wrappers drop their scoped component CSS — every wrapper gets consistent layout
  from the one stylesheet consumers already import, with no wrapper-specific class.
- e69435f: Make the `<aparte-chat>` shell framework-safe: it no longer injects its default
  viewport + composer when the element carries `framework-managed`. A framework
  wrapper whose component selector is `aparte-chat` (the Angular one) has its host
  upgraded by core, and its children only render _after_ `connectedCallback` — so
  the existing "author-provided composition wins" check cannot see them, and the
  default composition was being injected underneath the wrapper's own. Reuses the
  same `framework-managed` signal `<aparte-chat-viewport>` already takes.
- bfa9901: Theme every part of the chat from CSS. The message surface is now a
  `.aparte-message-content` region (attachments sit above it as a sibling, the
  avatar is opt-in — empty by default), and every theme value flows through a CSS
  custom property: colour, spacing, font size / weight / line-height, control
  sizes, radii and border widths. No hardcoded theme literals remain — only
  structural geometry (`100%`, `50%` radii, the spinner stroke). New scales:
  `--aparte-space-*`, `--aparte-font-size-*`, `--aparte-font-weight-*`,
  `--aparte-line-height-*`.

  BREAKING: the `--aparte-bubble-*` theme variables are renamed to
  `--aparte-message-content-*`.

- 554e4e9: **Remove the deprecated `<aparte-chat-input>` element** (`AparteChatInput`). It was the legacy
  monolithic composer — 653 lines of `innerHTML`-heavy code that auto-registered on import into
  the zero-dep core, was untested, and predated the modern `<aparte-composer>` + `<aparte-chat>`
  composition. It is no longer exported, registered, or styled; the elicitation panel and the
  client's target resolution already preferred `<aparte-composer>` and simply drop the legacy
  fallback. Reclaims bundle size and removes an untested surface from core.

  **Breaking** (pre-1.0, shipped minor): consumers still on `<aparte-chat-input>` should move to
  `<aparte-chat>` (or `<aparte-composer>` directly). The `AparteInputConfig` type stays.

- f8a6dd7: De-duplicate the wrappers' `AparteUi` prop-applier. The four wrappers each
  carried a byte-identical vanilla-DOM prop applier + event list; they're now in
  `@aparte/core` as `applyElementProps(el, props, transformValue?)` and
  `DEFAULT_UI_EVENTS`. Vue passes `toRaw` as the transform to unwrap its reactive
  proxy. No public wrapper API change.
- d60e2c8: Type the request `_meta` channel. `AparteChatRequest._meta` is now
  `AparteRequestMeta` instead of `Record<string, unknown>`: the five well-known
  keys (`pipeline`, `prefixSegments`, `artifactHint`, `artifactRaw`, `artifactXml`)
  are typed and documented, while an open index signature keeps it a channel for
  consumer-specific context. New exported types: `AparteRequestMeta`,
  `ApartePipelinePhase`, `AparteArtifactHint`.
- e8d9b32: Unify custom action registration into one zoned API.

  A single `registerAction(action)` now places a button via
  `zones: ('composer' | 'bubble')[]`, with per-zone options
  (`composer: { position, hidden }`, `bubble: { roles }`). Every action emits the
  declarative `aparte-action` event (now carrying `zone`), with an optional
  `onClick` callback fired alongside for convenience.

  **Breaking:** `registerBubbleAction`, `getRegisteredBubbleActions` and
  `unregisterBubbleAction` are removed, and the `AparteBubbleAction` type is merged
  into `AparteAction` (use `zones: ['bubble']` + `bubble.roles`). `getActions(zone)`
  now requires a zone argument.

### Patch Changes

- 6ab5682: Round-3 audit follow-ups (bounded fixes):

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

- 4065fd6: Bound the binary-artifact preview cache. `_binaryArtifactCache` held full file buffers
  (pdf/xlsx/docx) keyed by segment id and was never evicted, so a long session generating
  many binary artifacts grew memory for the page's lifetime. It's now capped (LRU-ish: cap
  24, oldest evicted on insert, re-insert refreshes recency).
- 307039b: Fix a small memory leak in the segment renderers: two internal per-segment throttle
  maps (syntax-highlight and artifact-dispatch debouncing) grew one entry per streamed
  segment for the page's lifetime. They're now bounded and evict oldest like the
  neighbouring binary-artifact cache, so long-running sessions no longer accumulate them.
- 333d301: Tighten the client's typing: the four near-identical local target interfaces
  (`AparteChatElement`/`RetryTarget`/`EditTarget`/`CompactTarget`) are consolidated into the
  one module-level `AparteChatTargetElement`, which removes ~two dozen gratuitous
  `(target as any).method` casts; the three `catch (err: any)` become `catch (err: unknown)`
  with narrowing; and `(segment as any).content` reads become a typed `{ content?: string }`
  cast. No behaviour change — pure typing rigor (the `as any`s were papering over methods the
  element already declares). Drops the repo's `no-explicit-any` warning count from ~63 to ~39.
- 14f1f1d: Collapse the triplicated send / retry / edit tail into one `_streamTurn` helper.

  `_handleSend`, `_handleRetry` and `_handleEdit` each re-implemented the same
  provider → tools → request-interceptor → `toolChoice:'none'` strip → reset-abort →
  `aparte-message-start` → `_streamLoop` → `aparte-message-done` / lifecycle-error
  sequence. They now share one private method, so that flow can't drift between the
  three entry points. As part of it, `_handleSend` uses the shared `_resolveAuth`
  helper and resets the abort flag before streaming — the two divergences the audit
  flagged (a documented past drift). No behavior change on the happy path (verified:
  867 unit incl. the retry/edit suites + parity, and 27/27 browser E2E).

- 18d2065: Enforce lint at zero warnings (`eslint . --max-warnings 0`) and clear the 37
  `no-explicit-any` backlog — each replaced with a precise type or, where DOM /
  custom-element interop genuinely requires it, a structural `unknown` cast (no blanket
  `any` disables). A few public types are tightened from `any` to a precise type or
  `unknown` (e.g. `AparteCustomSegment.data`, `AparteError` context) — a type-safety
  improvement with no runtime change.
- 6d6123e: Fix an XSS sink: the chat bubble's public `name` attribute was interpolated raw into
  `innerHTML` on initial render, while every sibling field (attachment names, etc.) was
  escaped. An app that binds an untrusted author/persona name into `name` would ship a
  script injection. Escaped it, consistent with the other fields, + a regression test.
- 97bd6c5: Escape three more consumer/stream-supplied fields that reached innerHTML unescaped: the
  composer action `label` and input `placeholder` (attribute positions) and a `message-id`
  CSS attribute-selector in the viewport (now `cssEscape`d like its siblings). Harden the
  bubble / conversation-list / attachment escape helpers to also escape `'`. Add a
  best-effort `.catch` to the fire-and-forget syntax-highlight and clipboard promises so a
  rejecting highlighter or clipboard write degrades silently instead of an unhandled rejection.
- 8417976: Harden the internal `[data-segment-id]` / `[message-id]` attribute-selector lookups in
  the bubble and viewport against a hostile, stream-supplied id: interpolated ids are now
  escaped for the quoted-attribute context (via a small `cssEscape` helper that needs no
  `CSS` global, so it also works in SSR/test runtimes). An id containing `"` (e.g. a
  provider-supplied tool-call id) can no longer throw a `SyntaxError` that drops a render
  update, nor form a selector list that mis-targets another element. Ids are random UUIDs
  by default, so this is defense-in-depth.
- 1f6c43e: Escape the `thinking` segment's `label` before it reaches `innerHTML` (the adjacent
  `content` was already escaped). Built-in callers always pass a hardcoded label, but a
  host rendering a model-derived label into a thinking segment would otherwise have a
  stored-XSS sink — closed defensively, consistent with the other renderer escapes.
- 2efef6f: Extract `_streamLoop`'s ~190-line `tool_use` case into a `_handleToolUseEvent` helper
  (built-in `create_artifact`, per-tool renderer, the human-in-the-loop approval gate, and
  the handler run with its timeout/abort). The loop now delegates and reads the
  continue/stop signal back. Behaviour-preserving — proven by the engine parity golden-master
  that drives the real `_streamLoop`, plus the client tool/HITL suites (869 tests, 27/27 e2e).
- 0aefd9b: Robustness fixes surfaced by the code audit:

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

- 0aefd9b: Escape untrusted model output before it reaches `innerHTML` (two DOM-XSS paths):

  - **core** — the code-segment `language` (the ` ```lang ` fence tag, LLM-authored and
    prompt-injectable) is now HTML-escaped in both the label text and the
    `class="language-…"` attribute; the file-tree node `status` too.
  - **core primitives** — `<aparte-select>` and `<aparte-optgroup>` build their labels via
    `textContent`, not `innerHTML`, matching their own update paths.
  - **plugin-model-selector** — remote model names/ids and provider labels are escaped before
    the option list is (re)built.

  Reachable from a hostile/aggregating `/models` endpoint or a prompt-injected code fence.

- 9568c6b: Escape `data-segment-id` in every segment renderer. A segment id can embed an untrusted
  tool-call id (`tool-${toolCallId}`, taken verbatim from the endpoint's SSE `tool_calls[].id`),
  so the tool-call renderer — and, defense-in-depth, all other renderers plus the ask-question
  receipt — now HTML-escape it before it reaches `innerHTML`. Closes a DOM-XSS reachable from a
  hostile OpenAI-compatible endpoint (the same class as the code-fence `language` fix, in a
  sibling sink). Regression test added.
- 7e5cfb7: Teardown + sanitizer hardening from the audit:

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

- 75af64a: Fix two browser-only defects surfaced by the new cross-framework browser E2E
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

- fa5a3f8: Message editing now reuses the composer's contenteditable input instead of a bespoke
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

- 8a3890b: Isolate streaming state between multiple chats on one page. Lifecycle events
  (`aparte-message-start` / `done` / `error` / `aborted`) and `aparte-abort` now
  carry the target host's `targetId`, and a composer only reacts to its own host's
  turn. Before this, streaming in one chat flipped every composer to the "Stop"
  state, a `done` in one reset the others (hiding an active elicitation panel), and
  cancelling one aborted every scoped client. Id-less single-instance pages still
  broadcast unchanged.
- 49f4d70: Robustness hardening: bound the file-generation handler map so a generation that never
  terminates (e.g. the conversation is cleared mid-flight) can no longer leak its window
  listeners for the page's lifetime; add a compile-time exhaustiveness guard on the
  stream-event switch so a new event variant fails the typecheck instead of being silently
  ignored; and mark every intentional fire-and-forget promise in the streaming / render
  paths explicitly (type-aware lint now guards against unhandled rejections).
- fcff831: Re-export the `AparteSystemPromptVarsProvider` type from the package root (both
  the browser and Node entries) so consumers can type the argument of the public
  `AparteConfig.setSystemPromptVarsProvider()` without reaching into a deep import.
- 455fc81: Branch + shell fixes:

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

- 6a50004: Harden the default sanitizer's residual defense-in-depth gaps:

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

- 9ce7978: Fix a server-side-rendering crash on the framework wrappers. The Node/SSR entry
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

- e96920a: Type `aparte-composer-change` in the `HTMLElementEventMap` augmentation, so
  `el.addEventListener('aparte-composer-change', e => e.detail)` is typed like the other public
  events (it's in `DEFAULT_UI_EVENTS`, so the wrappers already forward it). Closes the gap where
  a forwarded, typed event was missing from the event map.
