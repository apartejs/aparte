---
'@aparte/core': patch
---

A name, a file name, a conversation title or a tool name containing `$&`, `$'`, `` $` `` or `$$` now shows as written in the labels and questions that quote it ("Remove {name}", "Delete {title}?", "Run {tool}?", a message's author).

Those labels were filled with `String.replace`, which reads `$` sequences in the text it inserts: a file called `price$&.csv` was announced as "Remove price{name}.csv".
