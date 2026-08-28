---
"@aparte/plugin-ask-user": minor
---

`ask_user` now returns its answer structured as well as in prose: `structuredContent` is `{ action: 'accept', answers: [{ question, value }] }` — `value` a string for a single choice, a `string[]` for a multiple one — or `{ action: 'decline' }` (types `AskUserStructuredResult`, `AskUserAnswer`). The prose `content` the model reads is unchanged; `ASK_USER_DECLINED` stays what that prose says on a decline. The receipt in the transcript reads the structure when it is there and falls back to the prose for a result that came from elsewhere.

MCP's elicitation result is exactly this shape (an `action` beside the content), and a consumer had written a converter to get it back out of the sentence.
