---
'@aparte/core': patch
---

A long notice now wraps onto several lines instead of being clipped at the edge of the chat.

A notice (`kind: 'notice'`) wore the divider recipe, whose label is a single word that never wraps. "Marie joined the conversation" fit; a sentence such as "Someone of the team will answer you here, usually within minutes" ran past a narrow chat and was cut. The notice's text now wraps, centred, and the lines on either side keep a short stretch.
