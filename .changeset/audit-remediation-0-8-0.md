---
"@aparte/core": minor
"@aparte/engine": minor
"@aparte/provider-openai-compat": minor
"@aparte/provider-ai-sdk": minor
"@aparte/provider-transformers": minor
"@aparte/plugin-shiki": minor
"@aparte/plugin-ask-question": minor
"@aparte/plugin-model-selector": minor
---

Remediation of a from-scratch audit: four CRITICAL and nineteen MAJOR defects, plus the
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

  | before | after |
  | --- | --- |
  | `DirectTransport` | `AparteDirectTransport` |
  | `BackendTransport` | `AparteBackendTransport` |
  | `MessageRepository` | `AparteMessageRepository` |
  | `ConversationManager` | `AparteConversationManager` |
  | `DEFAULT_LOCALE` | `APARTE_DEFAULT_LOCALE` |
  | `DEFAULT_UI_EVENTS` | `APARTE_DEFAULT_UI_EVENTS` |
  | `DEFAULT_ICON_FALLBACKS` | `APARTE_DEFAULT_ICON_FALLBACKS` |
  | `DEFAULT_BUBBLE_ACTIONS` | `APARTE_DEFAULT_BUBBLE_ACTIONS` |
  | `DEFAULT_HOST_HANDLERS` | `APARTE_DEFAULT_HOST_HANDLERS` |
  | `DEFAULT_SKELETON_FALLBACKS` | `APARTE_DEFAULT_SKELETON_FALLBACKS` |

  Functions keep their verb names — `registerDefaultRenderers`, `contentToText`,
  `filesToAttachments` and the rest are unchanged, because prefixing a verb reads worse
  than the inconsistency it would fix.
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

  Scope, stated plainly: this covers what a plugin registers ON THE CONFIG — markdown,
  highlighting, model preferences. **Segment renderers are still global**
  (`registerSegmentRenderer` writes to a module-level registry), so two chats on a page
  cannot yet render the same segment type differently. The `config` prop is therefore
  more honest than it was, not yet fully honest.
- `thinkingDelimiters` is documented, including the two pairs recognised by default and
  the fact that only the bring-your-own-loop path can reach it.

**A known bug, stated rather than hidden**

In framework mode on WebKit — so React / Vue / Svelte / Angular consumers on Safari — a
streamed transcript can settle a few dozen pixels short of the bottom and stay there. It
is measured, deterministic, and marked as an expected failure in the browser suite with
four refuted explanations recorded next to it. The scroller demonstrably CAN reach the
bottom; the product stops early, and its own shortfall can then disarm the auto-follow
that would correct it. Four fixes were attempted and reverted, one of which regressed
scroll ownership — a transcript that steals the user's scroll position is worse than one
that stops short, so this ships open rather than half-fixed.
