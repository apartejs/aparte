---
'@aparte/core': patch
'@aparte/plugin-model-selector': patch
'@aparte/plugin-ask-user': patch
---

**Every element now declares and describes its own surface**, and the generated API reference prints each event's detail type.

The manifest is the source of truth for the component API, and it was quietly incomplete. Four elements carried a full `@element` / `@attr` / `@fires` block at the top of their file, separated from the class by imports and interfaces — TypeScript associates only the comment physically adjacent to a declaration, so every authored description was dropped on the floor. Nothing *looked* missing: the analyser reads `observedAttributes` and `this.dispatchEvent` structurally, so `<aparte-select>` still listed six attributes and three events. They just had no text, and the reference page shipped rows like `| aparte-cancel |  |`.

Seven event names reached the manifest through neither path and are now declared by hand, because no docblock fix can make them detectable: the analyser's fallback only visits real method declarations and only recognises `this.dispatchEvent`. `<aparte-conversation-list>` had **no events at all** — all four of its dispatches happen in an arrow class field. `<aparte-chat-bubble>` was missing exactly one, `aparte-branch-navigate`, for the same reason. `<aparte-composer>` was missing `aparte-abort` and `aparte-message-aborted`, which go out on `window`.

Every event that carries a detail now names its type — `@fires {CustomEvent<AparteConversationSelectDetail>} …` — sourced from `event-map.ts`, which is guarded in both directions. Before this, all 26 events in the manifest read as a bare `CustomEvent`; there was no working typed instance in the repo. The generated reference gained a **Type** column to print it, because that is what tells a consumer the shape of `e.detail`.

Result: 18 elements, every one with a description, every attribute and event described, 26 events of which 20 carry a typed detail.
