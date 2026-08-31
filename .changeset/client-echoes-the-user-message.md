---
"@aparte/core": patch
---

`AparteClient` echoes the user's message by default — and echo ownership is a handshake, so nothing doubles.

The optimistic user bubble used to be every raw-core host's job: everyone wrote the
same `aparte-send` handler, and whoever forgot shipped a chat where the person cannot
see what they typed — it compiles, it streams, and nothing errors. Three consumers hit
exactly that.

Whoever appends the user message marks the event (`detail.echoed`), and whoever sees
the mark yields: the `ConversationController` (capture phase, so always first) marks
for the wrappers' pairing with a raw client, and the client marks after its own echo,
so even two clients on one page render the message once. Attached files ride the
echoed bubble as attachments; the wire cannot double — the history builder already
excludes trailing unanswered user messages. A raw-core host that still appends its own
bubble should drop that handler, or pass `echoUserMessage: false` to keep ownership.
