---
'@aparte/core': patch
---

A Markdown, streaming-Markdown or highlight provider set after a message was drawn now redraws that message; you no longer have to set them before the chat renders.

The three setters did not notify, so a message drawn first kept its raw text for good: a static `<aparte-chat-bubble content="**x**">` upgraded by core's own import before `setupMarkedProvider()` ran, or a restored conversation drawn while a highlighter was still loading (`setupShikiProviderFromHighlighter(await createHighlighterCore(…))`). They now notify like the other renderers, and a message drawn with older providers is drawn again — at once, or when it finishes streaming. A message already drawn with the current providers is not touched by other config changes.
