---
'@aparte/core': minor
---

A custom error renderer now receives `appCode`: the code your own server or agent ended the run with (`engine-died`), which it could not see before.

Nothing to change in your code. A `run-error` line on aparté's agent wire, or an AG-UI `RUN_ERROR`, can carry a code aparté does not know. The runner folds it into `PROVIDER_ERROR`, so the default card still says a provider error in the reader's language, and keeps the raw value in the error's `data`. That value reached the `aparte-message-error` event only: the card saw `PROVIDER_ERROR`, and once the reply was saved the app's code was gone. It now rides on the error segment as `appCode`, saved with the message, and `setErrorRenderer` receives it beside `code`. A code of aparté's own (`USAGE_RATE_LIMIT`) is the error's `code` as before, and sets no `appCode`. The default card is unchanged: it shows the sentence of `PROVIDER_ERROR`, never the server's words.
