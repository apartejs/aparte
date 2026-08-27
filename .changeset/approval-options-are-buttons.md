---
'@aparte/core': patch
---

The approval panel's options and the elicitation panel's checkboxes and radios now use
core's own recipes instead of styling themselves.

An approval option is `aparte-btn aparte-btn--block aparte-btn--surface`. It used to
carry the button recipe AND a boxed `.aparte-field-choice`, which is a different thing
— a choice row is a value you pick and then submit, an approval settles on the click —
and, being two single-class selectors, the two sets of padding/border/radius were
separated only by import order. Long labels now wrap instead of being held on one line.

The 2px coloured edge on `--affirm` / `--deny` is gone, along with
`--aparte-approval-accent-width`. A coloured rule is an alert's vocabulary, not a
control's. Colouring the fills instead was measured and is worse: solid success gives
2.19:1 on the dark palette. The two classes stay on the element and carry no CSS —
they name the meaning for anyone restyling the panel.

The option controls are `.aparte-checkbox` / `.aparte-radio`. They were native inputs
tinted with `accent-color`, so they were the one part of the library the browser drew
itself — a light-mode UA put a pale box on a dark row. `--aparte-elic-control-size`
still sizes them.
