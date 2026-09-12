---
"@aparte/core": minor
"@aparte/locale-fr": minor
---

A conversation can be on its way: `<aparte-chat-viewport loading>` and `<aparte-conversation-list loading>` draw skeletons, the manager fetches a conversation's messages on demand through your adapter's `loadFull()`, and the controller sets `loading` while it waits and drops a reply for a conversation the user has already left.

Nothing to change unless your adapter implements `loadMeta()` and `loadFull()`: it is now used — `init()` reads the list through `loadMeta()` and `setConversationId(id)` fetches the messages through `loadFull(id)` the first time. `manager.isLoaded(id)` and `manager.ensureFull(id)` are public. An adapter with `loadAll()` alone behaves exactly as before.

What was wrong: `loadMeta()` and `loadFull()` were in the storage contract from the start and nothing called them, so between a click on a conversation and its messages there was no moment at all — and a page wired to a real store had to invent one, with a skeleton of its own over the components. Worse, `aparte-chat[center-empty]` decided it was empty by looking at the DOM: a transcript whose messages had not arrived yet has no bubble, so the welcome screen and the centred composer showed while a conversation loaded. Now:

- `<aparte-chat-viewport loading>` (reflected; `viewport.loading = true` or `setLoading(true)`) draws two skeleton turns with the kit's recipe, marks the scroll surface `aria-busy` and names the wait for a screen reader (locale key `loadingConversation`). `data-busy` is still a reply streaming; this is the transcript itself arriving.
- `aparte-chat[center-empty]` counts a loading viewport as not empty.
- `<aparte-chat>` disables its composer while its viewport is loading, and gives it back as it found it (a `disabled` you set stays). A send in that window raced the fetch: the message went into a history the arriving one overwrote.
- `<aparte-conversation-list loading>` draws six skeleton rows, `aria-busy`, with its own status line (locale key `loadingConversations`). Set it while your store answers, clear it when you assign `conversations`.
- `AparteChatBinding.setLoading?(on)` is the controller's way to say it; the default DOM binding sets the viewport's attribute.
- Two quick clicks: the controller re-reads the active id after the fetch and drops the stale reply, so A never paints over B.
