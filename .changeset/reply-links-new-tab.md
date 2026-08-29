---
"@aparte/core": minor
---

A link in a reply opens in its own tab by default: the built-in sanitizer sets `target="_blank" rel="noopener noreferrer"` on every external `http(s)` link it lets through (same-site and in-page links are left as written), and the bubble dispatches a cancelable `aparte-link-click` event (`detail: { href, anchor, messageId }`, bubbles to the chat host) before the browser follows any link in a message body — `preventDefault()` cancels the navigation so a host can route the link itself.

Issue #38: `marked` sets no `target`, and the sanitizer only added `rel` when one was already present, so a model-written link was a bare `<a href>` that navigated the frame the chat lives in — in an Electron window, the whole application. A host that wants the old behaviour wraps the default sanitizer through `setHtmlSanitizer()` and strips `target` again.
