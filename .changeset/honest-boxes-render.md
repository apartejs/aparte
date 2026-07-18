---
"@aparte/core": patch
---

Fix two browser-only defects surfaced by the new cross-framework browser E2E
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
