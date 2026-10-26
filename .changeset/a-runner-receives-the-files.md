---
"@aparte/core": minor
"@aparte/engine": minor
---

A `streamRunner` now receives the files attached to the message it answers, as `files` in its run options — so a runner whose backend takes uploads can send them as files, PDFs and spreadsheets included. Nothing changes for a provider or for `runStreamAgent`.

The client inlines images and text files into the request and drops every other file with a warning: right for a model, wrong for a backend that reads uploads itself, such as n8n's Chat Trigger. Pair it with `rawFileInject: 'none'` so the files are not also inlined into the message's text. Set on a send only: a retry or an edit carries no files again.
