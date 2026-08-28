---
"@aparte/core": patch
---

`<aparte-select>` keeps one width — its widest option's — whatever is selected, like a native `<select>`; it used to resize to the selected label on every change. The trigger's label is now a grid of two layers (`.aparte-select-label-text` and a hidden `.aparte-select-label-sizer` stack of every option's label); a stylesheet that targeted `.aparte-select-label`'s text directly should target `.aparte-select-label-text`. A host that constrains the control narrower than its widest option still gets an ellipsis.
