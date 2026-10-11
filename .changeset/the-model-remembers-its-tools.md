---
"@aparte/core": minor
"@aparte/plugin-compaction": minor
---

The model now remembers what its tools returned: each turn's history carries the tool calls and their results, not only the text. **If you serialize the history yourself** — a backend of your own that does not go through an aparté provider or `toModelMessages` — it now contains assistant messages with `toolCalls` and `role: 'tool'` messages, the shapes a tool round trip already used inside one turn: map them, or drop both. Through an aparté provider there is nothing to do. Requests grow on tool-heavy conversations; `@aparte/plugin-compaction` now counts those calls when it measures a conversation, and summarises long ones as before.

Until now `AparteClient` sent user and assistant text alone, so a `read_file` result was on screen and gone from the model's context one turn later — "what did the file say?" had no answer. A reply is now sent in the order it was shown: the text before some calls and those calls as an assistant message, each call's result as a `tool` message, the text after them as the next assistant message. Every call is answered, because providers reject a call left without one: a refused call sends its reason, a failed one its error line, a stopped one "The tool call was stopped before it ran." Send, retry and edit build the history through the same function, so they cannot disagree. The compactor's selector used to count a tool call as free (it has no `content`); it now costs what its arguments and result send the model.
