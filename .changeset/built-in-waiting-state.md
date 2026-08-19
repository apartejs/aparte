---
"@aparte/core": minor
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/angular": patch
---

**The waiting state now exists.** Between "user sends" and the first token there was a bubble
with a name and an empty body — and, in the display-only path, copy/retry on a reply that
hadn't happened. The bubble now shows a built-in indicator while it is in flight with nothing
in it: animated dots (CSS, so no per-token work, themable via `--aparte-waiting-*`, and
already covered by the reduced-motion rule) plus a screen-reader label taken from
`locale.typing` — a string that shipped in `DEFAULT_LOCALE` and was read by nothing until now.

No wiring: it works in raw `<aparte-chat>`, in the four wrappers, and in a hand-rolled loop.
`<aparte-chat-status>` / `isTyping` stay **your** channel for your own status ("indexing your
files"), which is why they are not auto-driven.

New export **`isAwaitingReply(message)`** — the one rule core and all four wrappers now share
for "is this bubble in flight". Besides `status: 'streaming' | 'pending'`, it also covers an
**assistant message with no `status` at all and nothing in it**: the empty shell a token stream
is about to fill. That case used to render as a finished reply, action bar included. Only
silence is interpreted — an explicit status, `'completed'` on an empty message included, is
believed.

If you deliberately append empty assistant bubbles that no stream will fill, give them an
explicit `status` (e.g. `'completed'`) or they will show the indicator.
