---
"@aparte/core": patch
---

The tabs recipe's examples now ship the roving `tabindex`, `aria-controls` and `aria-labelledby` that their `role="tablist"` promises, and the segmented variant has a panel. Copying the banner markup no longer copies a defect.

The examples are the live preview the kit page renders, and they showed a `role="tablist"` of plain buttons: every tab a tab stop, none of them naming a panel — which announces more than plain buttons and does less. The banner now also says which part stays the app's (the ArrowLeft/ArrowRight/Home/End handler) and points at a working one.
