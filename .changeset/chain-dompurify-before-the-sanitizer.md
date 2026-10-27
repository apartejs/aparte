---
'@aparte/core': patch
---

If you replaced the sanitizer with `DOMPurify.sanitize`, chain it in front of the built-in one instead: `setHtmlSanitizer((html) => defaultSanitizer(DOMPurify.sanitize(html)))`.

The Markdown guide and the `setHtmlSanitizer` example used to show DOMPurify on its own, as the hardened option. `setHtmlSanitizer` replaces the built-in sanitizer, though, and DOMPurify's defaults are written for any page rather than for a chat. Measured on DOMPurify 3.4.17, they keep seven of nine things the built-in one refuses in a model's HTML: inline layout styles (a full-screen overlay), core's `aparte-` classes (a forged approval button), `--aparte-*` properties (the theme repainted from inside a reply), `<form>` and `<button>`, a password `<input>`, `id` (DOM clobbering), and an external link left to navigate the chat's own frame. Chained in front of `defaultSanitizer`, all nine are refused again.

No behaviour changes in core: `defaultSanitizer` was already exported. The documentation changes, and so does the warning `setHtmlSanitizer(null)` prints.
