---
"@aparte/core": minor
"@aparte/locales": minor
---

A failed turn now shows a plain sentence chosen by the error's code, in the reader's language, instead of the transport's or the provider's raw message. The raw message goes to the browser's console and stays on the error segment; `setErrorRenderer` still receives it as `message`, and now also the `sentence`.

Seven locale keys hold the sentences, and every language of `@aparte/locales` translates them: `errorUnreachable` (NET_OFFLINE, NET_ERROR), `errorTimeout` (NET_TIMEOUT), `errorRefused` (CONFIG_INVALID_KEY, a 401 or a 403), `errorRateLimited` (USAGE_RATE_LIMIT), `errorTooLong` (USAGE_CONTEXT_EXCEEDED), `errorFailed` (PROVIDER_ERROR, PROVIDER_UNAVAILABLE) and `errorNoAnswer` (USAGE_BAD_REQUEST, PROVIDER_POLICY, CONFIG_INVALID_MODEL, UNKNOWN_ERROR). "Try again in a moment" is said only where a moment can help. `extendLocale` changes them.

A tool whose handler throws now ends the turn as UNKNOWN_ERROR, whatever it threw: its own failed fetch or 401 no longer reads as the assistant being unreachable or the provider refusing the key.

An error keeps its own words when they were written for the reader or the developer already: the turn limit (MAX_TURNS_EXCEEDED, localized when it is raised), the two setup errors core raises before any request (CONFIG_NO_PROVIDER, CONFIG_MISSING_KEY), and an error segment an app or a plugin adds with a code of its own or none. A custom error renderer's card is left alone on a language switch.
