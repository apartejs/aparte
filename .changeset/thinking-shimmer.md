---
"@aparte/core": minor
---

The reasoning label now shimmers while the block streams. Nothing to change in your code; the light stops when the block settles.

"Thinking" was a still word above a block that was filling up; conversational chats sweep a light across it while the model is still reasoning, and AI Elements and assistant-ui do it by default. It follows the block's own `isStreaming: true`, so a block written by hand or restored from storage stays still, and it never moves under `prefers-reduced-motion`. To keep the label still, override `.aparte-thinking-label.aparte-shimmer` in your stylesheet.

The client now marks a streamed reasoning block `isStreaming: true` while it arrives (it was left unset), and settles it at the model's first tool call as well as at its first answer token, so a block followed by a tool call no longer reads "Thinking" while the tool runs.
