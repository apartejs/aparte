---
"@aparte/core": patch
---

`createAparteChatHandler` answers a failed vendor fetch with `502 Vendor request failed.` and an unknown `providerId` with `400` even when the name is an inherited key such as `__proto__` — two status codes a caller may see change.

The 502 body is now a fixed string. It used to be the exception's own message, and that message can name the URL it tried: `authQuery` (Gemini's `?key=`) puts the API key in the URL, and a custom `fetchImpl` prints the URL in its error text (`node-fetch`: `request to ${url} failed, reason: …`). The vendor's prose goes to the server's log via `console.error`, never to the client — the same rule the non-`ok` branch already followed.

The 400 is the `providerId` lookup. It read `options.providers[providerId]` on a client-supplied string, so on a plain object literal `providers["__proto__"]` and `providers["constructor"]` resolve to a truthy inherited value: the "Unknown providerId" 400 was skipped and the request fell through to a 500 further down. The lookup is `Object.hasOwn` now.
