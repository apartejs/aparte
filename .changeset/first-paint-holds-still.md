---
"@aparte/core": patch
---

`dist/index.css` is minified (138 kB instead of 368, 20 kB gzip instead of 98), and a page that ships the chat as static HTML no longer jumps when the elements upgrade.

Measured with Lighthouse on the vanilla example built for production: the cumulative layout shift went from 0.226 to 0.011 and the performance score from 88 to 100. Four rules apply before an element is defined, so the first paint already has the final shape:

- `aparte-chat[center-empty]` with no bubble in its markup centres its composer from the first frame; the viewport releases its height the way it does once `data-empty` is written.
- `aparte-composer-input` reserves the editor's height (`--aparte-composer-control-size`).
- `aparte-suggestions` reserves one row of chips while the chat is empty.
- `aparte-composer-toolbar` holding only whitespace draws nothing, as it will once it reflects `data-empty`.

The minified stylesheet is what a page that links `dist/index.css` directly (a CDN, no bundler) downloads; a bundler minified it already and sees no change.
