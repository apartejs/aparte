---
'@aparte/core': minor
'@aparte/plugin-ask-user': patch
---

**Breaking, pre-1.0, no shim:** a request for the human that ends without an answer now **rejects** instead of resolving `{ action: 'cancel' }`.

`AparteElicitationResult` loses its `cancel` arm and keeps `accept` / `decline`. The failure arrives as the new `AparteElicitationAbortError`, whose `name` is `'AbortError'` — so any handler already testing `err.name === 'AbortError'` needs no change — and whose `reason` is `'aborted'` (a stopped turn, a fired signal, a question taken away by another request) or `'no-presenter'` (nothing was mounted to ask it).

Why the shape had to change: a value is easy to handle as though it were an answer, and that is exactly what happened one level up. The tool-approval gate read `cancel` as a refusal, stamped the segment `rejected`, and told the model "Tool execution was rejected by the user." The user had pressed Stop. A rejection cannot be mistaken for a decision by a caller that forgot a branch, which is the property `cancel` never had.

Evidence the shape is right: `askUserHandler` already performed this exact conversion by hand — `{ action: 'cancel' }` in, `new DOMException(..., 'AbortError')` out. That conversion is gone; the error now propagates from the primitive.

**Migrating.** Replace a `case 'cancel':` branch with a `catch`. A `switch` on `action` that had all three arms keeps compiling with two, and the third path becomes the `catch`. One consequence worth knowing: a request you start and never `await` will surface an unhandled rejection when it ends without an answer, because that is what an ignored failed promise is — attach a `.catch()` if you genuinely do not care about the outcome.
