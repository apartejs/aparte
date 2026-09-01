---
"@aparte/core": patch
---

The spinner, the skeleton, the indeterminate progress bar and the status dot stop under `prefers-reduced-motion: reduce` instead of flickering.

The duration tokens were already reset to 0.01ms under that media query, but a 0.01ms cycle with `infinite` left in place is not stillness: the recipe keeps repainting at a random phase every frame. The descendant sweep in `responsive.css` only reaches elements inside aparté's own custom elements, so a recipe used in a consumer's own markup got neither. Each looping recipe now stops itself with `animation: none`, the way the spinning icon already did. The skeleton also drops its shine (a stopped gradient sat as a pale band) and the indeterminate bar fills the track (a stopped segment sitting at one spot read as a value). A stylesheet test now asks the same of every looping animation in core.
