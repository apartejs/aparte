---
"@aparte/core": patch
---

Reaching the elicitation panel's "Other…" radio with the arrow keys now reveals the text field without moving the focus into it; a click or Space still focuses it.

Arrow keys select as they move inside a radiogroup, so the `change` they fire is not consent. Focusing on it carried a keyboard reader out of the group with no activation at all — WCAG SC 3.2.2 and its F36 failure, the same rule this panel already follows when it makes one choice one button.
