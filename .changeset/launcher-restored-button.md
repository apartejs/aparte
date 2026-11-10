---
'@aparte/core': patch
---

`<aparte-launcher>` brought back from saved HTML now shows one working button, not two.

Livewire's `wire:navigate` keeps a page's HTML for the Back button and parses it back in, and so does any page cache that restores markup. The launcher it brings back is a new element whose markup already holds the button the old one drew. It drew a second one beside it, and the first never opened anything. It now takes up the button in its markup, and drops any other copy. Nothing to change in your code.
