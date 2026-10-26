---
"@aparte/core": minor
"@aparte/locales": minor
---

A failed turn now shows a plain sentence chosen by the error's code, in the reader's language, instead of the transport's or the provider's raw message. The raw message goes to the console and stays on the error segment; `setErrorRenderer` still receives it as `message`.

Six locale keys hold the sentences, and every language of `@aparte/locales` translates them: `errorUnreachable` (NET_OFFLINE, NET_ERROR), `errorTimeout` (NET_TIMEOUT), `errorRefused` (CONFIG_INVALID_KEY), `errorRateLimited` (USAGE_RATE_LIMIT), `errorTooLong` (USAGE_CONTEXT_EXCEEDED) and `errorFailed` (a provider's failure, a bad request, a policy refusal, an unknown error). `extendLocale` changes them.

An error keeps its own words when they were written for the reader or the developer already: the turn limit (MAX_TURNS_EXCEEDED, localized when it is raised), the setup errors (CONFIG_NO_PROVIDER, CONFIG_MISSING_KEY, CONFIG_INVALID_MODEL), and an error segment an app or a plugin adds with a code of its own or none.
