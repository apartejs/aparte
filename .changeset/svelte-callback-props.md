---
"@aparte/svelte": patch
---

`<AparteChat>` and `<AparteUi>` accept callback props alongside their events: `onmessageSent`, `onaction`, `onmessagesChange`, `onmessageAppended`, `ontypingChange`, `onconversationCreated` on the chat, `onelementEvent` on the element host. Each is called with the payload itself (no `CustomEvent` to unwrap), in addition to the event, so a Svelte 4 consumer changes nothing and a Svelte 5 consumer never writes `on:` on a component. The Svelte 5 example now runs in runes mode on those callbacks.

Svelte 5 documents `createEventDispatcher` as deprecated and recommends callback props; measured before this landed, the 5.56 compiler warns on neither the dispatcher nor `on:` on a component (only on `on:` for a DOM element in runes mode), so this is the framework's idiom arriving in the wrapper, not an emergency. The other three wrappers already speak theirs: React props, Vue emits, Angular outputs.
