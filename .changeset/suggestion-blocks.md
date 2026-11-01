---
"@aparte/core": minor
---

An answer can offer quick replies: call `setupSuggestionBlocks()` and put `<aparte-suggestions answers>` in the composer; a ```suggestions block of JSON in a reply then shows as buttons above the input.

````md
Which day suits you?
```suggestions
["Tuesday 3", "Wednesday 4", { "label": "Another week", "prompt": "Next week, please" }]
```
````

For a backend that only sends text (an n8n workflow, a plain completion), the way a card is
written as a ```card-<name> block. The block draws nothing in the message; the element shows the
replies of the LAST answer, a click sends one as if typed, and they go the moment a message is
sent or when the last message is the person's. A block that is not a list shows as its source;
one still being written offers nothing. Off until `setupSuggestionBlocks()` is called.

No new system: one more user of `registerCodeLanguageRenderer`, the seam cards use. A new guide,
*Blocks in a text answer*, puts the rule in one place: a code block whose language aparté knows
becomes part of the interface, any other is shown as code — and shows how to add a language of
your own.
