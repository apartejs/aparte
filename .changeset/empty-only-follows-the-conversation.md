---
"@aparte/core": patch
---

`<aparte-suggestions empty-only>` now shows its starters while the conversation is empty, instead of hiding them for good on the first send: they stay hidden over a restored thread and come back after a new chat. `<aparte-chat>` now reflects `data-empty` whether or not `center-empty` is set (#90).

If you counted messages to hide or re-show the starters yourself, you can drop that code. If you relied on `aparte-chat[data-empty]` only appearing with `center-empty`, add `[center-empty]` to your selector — core's own rules already carry it, so no built-in layout moves.

`empty-only` used to read the composer's `aparte-send` alone. It did not look at the conversation, so a thread loaded through `setMessages`, a wrapper's `messages` or a conversation manager showed the starters on top of its transcript (nothing had been sent yet), and after a new chat cleared the thread they never came back. The row now follows the transcript of the chat it serves — found around its composer, around itself, or by `target` — with the same test `<aparte-chat>` uses: no `<aparte-chat-bubble>`, and not `loading`, so a thread being fetched counts as not empty. The send is kept as the other half. It hides the row on the click rather than a frame later when the bubble lands, and it is all there is to read when the messages are not `<aparte-chat-bubble>`s (React's `renderBubble`) or when the composer sits outside any chat. In both of those cases the row behaves exactly as before. The element lifts only a `hidden` it set itself, and removing `empty-only` shows the row again.

`data-empty` on `<aparte-chat>` was a by-product of `center-empty`, so the chat's one statement of "this conversation is empty" was only available to apps that also wanted a centred composer. It now follows the conversation on every `<aparte-chat>`, including Angular's `framework-managed` host once its viewport renders. React, Vue and Svelte render a `[data-aparte-chat]` div rather than the element and are unchanged.
