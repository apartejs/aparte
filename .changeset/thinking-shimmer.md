---
"@aparte/core": minor
---

The reasoning label now shimmers while the block streams. Nothing to change in your code; the light stops when the block settles.

"Thinking" was a still word above a block that was filling up; conversational chats sweep a light across it while the model is still reasoning, and AI Elements and assistant-ui do it by default. It follows the block's own `isStreaming: true`, so a block written by hand or restored from storage stays still, and it never moves under `prefers-reduced-motion`. The label is drawn through its text fill while it shimmers, so a colour you set on `.aparte-thinking-label` shows once the block settles (recolour the sweep with `--aparte-shimmer-base` / `--aparte-shimmer-shine`). To keep the label still:

```css
.aparte-thinking-label.aparte-shimmer {
  animation: none;
  background-image: none;
  -webkit-text-fill-color: currentColor;
  color: inherit;
}
```

The client now marks a streamed reasoning block `isStreaming: true` while it arrives (it was left unset), and settles it at the model's first tool call and at a new step as well as at its first answer token, so a block followed by a tool call no longer reads "Thinking" while the tool runs. Only the answer folds it: a tool call does not close a block the reader opened.
