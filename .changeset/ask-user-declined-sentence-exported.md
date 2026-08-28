---
"@aparte/plugin-ask-user": minor
---

`ASK_USER_DECLINED` is exported: the exact sentence the tool returns as its result when the user declines (`'The user declined to answer.'`). Import it instead of copying the literal — a host that turns tool results into prose, or recognises a declined question in its own transcript, matched the string by hand until now, and a rewording here would have broken it without a word.

The constant existed for the receipt's own sake (the card must show "declined" rather than pair that sentence with the first question as though the user had said it) and never left the module. Reported by a consumer who had checked.
