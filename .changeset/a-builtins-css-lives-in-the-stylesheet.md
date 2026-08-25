---
'@aparte/core': patch
---

**A built-in renderer's CSS moved out of `getStyles()` and into `styles/aparte.css`** — the tool call, the artifact card and the pipeline-waiting segment, 419 lines in total. No visual change: the same rules, in a file that ships the same way.

`getStyles()` stays on the renderer interface, because that seam is what a *consumer's* renderer needs — something registered through `registerSegmentRenderer` or `registerToolRenderer` cannot edit core's stylesheet and has no other way onto the page. A built-in has the stylesheet.

Two measured reasons. `check:derived-vars` reads that one path and nothing else, so a declaration deriving from another variable could hide in a renderer unchecked. And CSS in a template literal is not read as CSS: a backtick closes the literal — the artifact card's own comment recorded that happening, and it happened three more times in one sitting, the worst rendering a source marker into an assistant's bubble as prose, because inside a template literal a `//` comment is just text.

Also removes a dead rule that tinted the tool row's border while a decision was pending: it stopped painting anything when that border went away in the row redesign, and it reached for `--aparte-border-strong`, a variable that was never declared anywhere.

Contract-neutral: core's entry imports the stylesheet and `package.json` marks every `.css` a side effect, so importing `@aparte/core` has always brought it along.
