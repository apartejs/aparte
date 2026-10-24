---
"@aparte/core": minor
---

`<aparte-conversation-list>` shows what each conversation is doing: its title shimmers while an AI answers in it, and a mark appears while its run is paused on the page (a server run waiting on an approval, a question or a browser tool). With a conversation controller, nothing to write.

`setConversationStatus(id, 'running' | 'waiting' | null)` and `getConversationStatus(id)` on the list; the row carries `data-status`, a screen reader hears the state with the title (new locale keys `conversationRunning`, `conversationWaiting`), and the mark (`.aparte-conv-item__status`) is an empty slot until a state draws it, so the look is yours in CSS. The conversation controller sends the new `aparte-conversation-status` event on `window` as turns start (`running`), pause on the person (`waiting`) and end (`null`), always about the conversation the turn started in; every list applies it. New types: `AparteConversationStatus`, `AparteConversationStatusDetail`.

A state is kept for the page, not per list: every list draws it, one that connects later (a drawer, a remount) included, keyed by conversation id. The controller follows the turn in flight by its message id, so a replaced turn's end does not clear the new turn's state, and a chat unbound mid-turn (a route change) leaves no row running.
