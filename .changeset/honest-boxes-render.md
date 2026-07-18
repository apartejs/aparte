---
"@aparte/core": patch
---

Fix two browser-only defects surfaced by the new cross-framework browser E2E
suite (both passed the jsdom unit tests):

- **Standalone send now resolves the viewport.** In the documented flat layout
  (`<aparte-chat>` wrapping `<aparte-chat-viewport>`), the client's send handler
  matched the shell first and — finding no `appendMessage` on it — silently
  dropped the reply. It now scans every candidate for the one that can actually
  render, so a bare-shell chat streams assistant replies out of the box.
- **The model-gate style applies to every host.** The `data-model-gated` opacity
  rule had been mis-scoped (a comment split the selector list), leaving the
  vanilla composer permanently dimmed and greying only a `[data-aparte-chat]`
  direct child when gated. It is now an unscoped `aparte-composer[data-model-gated]`
  rule that dims any gated composer, in every wrapper and the vanilla shell.
