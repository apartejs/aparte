---
'@aparte/core': minor
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
'@aparte/angular': minor
---

A letter typed after a click or a selection in the chat now goes to the input. Nothing to change; `type-to-focus="off"` (`typeToFocus="off"` on the framework components) turns it off.

Someone who selects a few words of a reply to copy them, then goes on typing, used to type into nothing: the click had taken the caret out of the input. The composer now takes it back on the first key that writes a character.

- It applies when the person was last in the chat: the last click was in the chat, or the focus is on one of its controls. The page around an embedded chat keeps its own keys.
- `type-to-focus="page"` takes a letter typed anywhere in the page, for an app whose page is the chat.
- Never taken: a key typed in a field (yours or the chat's), a shortcut, the space bar, Tab, Enter, the arrows, a key another handler cancelled.
- The attribute is read on `<aparte-composer>`, and `<aparte-chat>` forwards it. New exported type: `AparteTypeToFocus`.
