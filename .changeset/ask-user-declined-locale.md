---
"@aparte/plugin-ask-user": patch
---

A declined question's receipt line follows the locale (`questionDeclined`), and `receipt: false` keeps the call in the model's history.

The receipt printed `ASK_USER_DECLINED` — "The user declined to answer.", the sentence the model reads — under a question in any language; the constant keeps its value for the model. `receipt: false` registered a renderer that draws nothing, which kept the call out of the history; it declares the tool hidden through `registerToolDisplay` now.
