---
'@aparte/core': patch
'@aparte/locale-fr': patch
---

The status line and a live reasoning block now speak the chat's locale: no more English "Typing" or "Thinking" under a French locale.

`<aparte-chat-status>` without `text` names itself, and tells a screen reader, from the `typing` key instead of an English literal, and follows a locale change. A reasoning block streamed from a model no longer carries a hard-coded `label: 'Thinking'`, so the renderer names it from the `thinking` key and relabels it on a locale change, like a block restored from history. The English defaults lose their ellipsis, because they also name a block that is over: `thinking` is "Thinking", `typing` is "Typing"; in French, `thinking` is « Réflexion ». A `label` you set on a segment still wins. If you read `segment.label` on a streamed reasoning segment, it is now `undefined`: fall back to the locale's `thinking`, as the renderer does. A test matching "Thinking..." or "Typing..." (or « Réflexion en cours... ») reads the new words.
