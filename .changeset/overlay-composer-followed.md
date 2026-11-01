---
"@aparte/core": patch
"@aparte/angular": patch
---

Angular's `overlayComposer` keeps the end of the transcript above the composer again. `overlay-composer` can now be set or removed after the chat mounts.

The viewport read the attribute once, when it connected. Angular binds it on its inner container after that moment, so the viewport never measured the composer and left `--aparte-bottom-inset` unset: the last message and its action bar sat under the composer. Short turns hid it, because the space kept under a new question was taller than the composer; a question taller than the view brought that space to 0 and showed it. The viewport now follows the attribute on its parent, both ways. React, Vue and Svelte were not affected: they set the attribute before the chat is inserted.
