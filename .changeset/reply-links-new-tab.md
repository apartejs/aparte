---
"@aparte/core": minor
---

A link in a reply opens in its own tab, and a host can intercept it: the built-in sanitizer sets `target="_blank" rel="noopener noreferrer"` on every external `http(s)` link it lets through, and the bubble dispatches a cancelable `aparte-link-click` event (`detail: { href, anchor, messageId }`, bubbles to the chat host) before the browser follows any link in a message body — `preventDefault()` cancels the navigation so a host can route the link itself.

A bare same-site or in-page link (relative, `#`, `mailto:`) is left as written. A same-site link that carries a `target` of its own is not: see the entry on model-written `target` and `rel`, which the sanitizer clamps rather than copies — only `_self`, and only where the link was staying here anyway, is honoured.

Issue #38: `marked` sets no `target`, and the sanitizer only added `rel` when one was already present, so a model-written link was a bare `<a href>` that navigated the frame the chat lives in — in an Electron window, the whole application. A host that wants the old behaviour wraps the default sanitizer through `setHtmlSanitizer()` and strips `target` again.
