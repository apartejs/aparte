---
'@aparte/core': minor
'@aparte/locale-fr': minor
---

A message whose bubble has a `name` is now named after it for screen readers ("Message from Camille"); without one it is still "Your message" or "Assistant response". The new locale key is `messageFrom`, with `{name}`.

The accessible name followed the role alone, so every message on the assistant's side — a human agent answering there included — was "Assistant response" while the page showed that person's name above it.
