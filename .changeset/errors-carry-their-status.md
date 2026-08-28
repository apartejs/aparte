---
"@aparte/core": minor
---

A non-ok response from `AparteDirectTransport` or `AparteBackendTransport` now throws an `AparteError` with the vendor's message, `httpStatus` and a `code` read off the status; until now every one of them reached the error card and `aparte-message-error` as `UNKNOWN_ERROR`, whatever the vendor had said. A listener that matched `code === 'UNKNOWN_ERROR'` to catch transport failures should match the new codes (or the class) instead. The table: `429` → `USAGE_RATE_LIMIT`, `401`/`403` → `CONFIG_INVALID_KEY` (new code), `503` → `PROVIDER_UNAVAILABLE`, other `5xx` → `PROVIDER_ERROR`, `400` → `USAGE_BAD_REQUEST`, `408` → `NET_TIMEOUT`.

`AparteError.from()` applies the same table to any error that carries a `status`, reads `fetch`'s network failure (a `TypeError` naming the fetch) as `NET_ERROR` — `NET_OFFLINE` when `navigator.onLine` is false — and a `TimeoutError` as `NET_TIMEOUT`; a code the caller names is kept. `AparteError.codeForStatus(status)` is exported for a provider that wants the same mapping. A `404` stays unclassified on purpose: it is a wrong model or a wrong URL, and the message says which.
