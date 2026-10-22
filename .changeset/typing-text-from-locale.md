---
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
'@aparte/angular': minor
---

The framework components' typing line now defaults to the locale's `typing` word ("Typing", « Écrit... » in French) instead of the English 'Assistant is thinking...'; `typingText` still overrides it.

It was the one visible string a localised app had to translate by passing a prop, and the only one in the chat that ignored the locale. If you relied on the old English sentence, pass `typingText="Assistant is thinking..."`.
