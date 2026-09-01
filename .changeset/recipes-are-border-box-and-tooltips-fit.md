---
"@aparte/core": patch
---

The spinner, the menu, the popover, the tooltip and `<aparte-chat>` are `box-sizing: border-box`, so their tokens and an author's `height` are the box they paint; a tooltip is as wide as its label.

Core ships no global reset on purpose, and these recipes set a size and a padding or border in the same rule, so they painted larger than their token under the browser's default: the spinner 16/20/28 for tokens of 12/16/24, the popover 342px for a cap of 320, `<aparte-chat style="height: 320px">` 336px with a split's seam hanging 16px below both panels — and the token's value only on a host page with a border-box reset of its own. The tooltip declared a `max-width` and no width, so as a positioned chip it shrank to its widest word: "Copy to clipboard" broke into two lines at every width. It is `width: max-content` now, with the same cap.
