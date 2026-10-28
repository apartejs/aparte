---
'@aparte/provider-openai-compat': patch
---

An LM Studio server that cannot be reached no longer gets a second request to its older `/api/v0/models` API when the context window is read.

The fallback is for a server that answers without the v1 REST API (an HTTP error); a request that got no answer at all — the server is down, or the page is being left — now ends the probe with no window, as any other failed probe does. In WebKit the second request, sent while a page was being left, surfaced as a page error.
