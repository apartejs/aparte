---
"@aparte/core": minor
"@aparte/engine": minor
"@aparte/provider-transformers": patch
---

A binary attachment now warns instead of vanishing; `AparteFilePart` is removed — aparté inlines images and text files only. If you referenced `AparteFilePart` (or engine's `StreamFilePart`) in your own types, drop it: `AparteContentPart` is text or image.

Nothing ever produced a file part. The client inlines images and recognized text files and returned `null` for everything else, and both wire mappers answered the type with an empty text part — a branch no message could reach. What the type did do was promise a consumer that attaching a PDF sent it, while the chip stayed on screen and the model answered as if nothing had come with the message. That promise is now a warning at the one place the file is really dropped, once per file, naming the file and its type; the chip is untouched, so your own upload or RAG layer still sees it on the `aparte-send` event.

The two-arm union also empties the third mapper's fallback: the vision runner counted "content parts this runner cannot carry" and warned about them, over a branch no message could reach. The count and its warning are gone, the same way they went from the two wire mappers.
