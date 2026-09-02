---
"@aparte/core": patch
---

Lifecycle events (`aparte-message-start`/`-done`/`-error`/`-aborted`, and the tool-approval request) now carry the chat's id when the render target is a shell's viewport, so a second chat on the page no longer answers to the first one's turn.

The stamp read `target.id`, and the target is whatever RENDERS: an `<aparte-chat>` shell delegates rendering to its `.viewport`, which has no id of its own. So on every shell-shaped chat the events went out with `targetId: undefined` — and the receive side reads a missing id as "for me", deliberately, so a single-chat page needs no wiring.

On a two-chat page that made one chat's turn drive every composer: chat B finishing re-enabled chat A's send button mid-stream and evicted A's open elicitation panel, so the question vanished under the user's cursor while A's tool call kept waiting. The client now resolves the id by climbing to the chat host — the same rule `aparte-composer` uses to identify itself, so the two halves of the channel cannot disagree — and `target.id` remains the fallback, which is correct for the viewport-only chat shape.
