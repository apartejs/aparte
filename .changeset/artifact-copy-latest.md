---
'@aparte/plugin-artifacts': patch
---

Copy on an artifact card now copies the artifact as the card shows it; a streamed artifact used to copy an empty string.

The card is set up before a streamed `<artifact>` sends its first chunk and is then filled by its updates. Download, Open and the preview read the latest content, but Copy read the content the card was set up with — empty, or the first chunk. The same held for a card from a tool call set up before its result arrived.
