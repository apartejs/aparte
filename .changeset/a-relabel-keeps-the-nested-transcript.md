---
'@aparte/plugin-subagents': patch
---

Changing the language, the icons or a tool while a sub-agent is open in a view no longer empties the nested sub-agent's conversation in the chat.

The view relabelled its rows outside its drawing, with no surface: a nested sub-agent's row in the view asked for the chat's element of that conversation, and moved it into the view. The chat's row stayed empty until it was drawn again, which after the run's end may never come. Every pass over a view's rows now runs on that view's surface, a line's detail on the surface it sits in.
