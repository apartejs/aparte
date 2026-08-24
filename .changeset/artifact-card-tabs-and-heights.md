---
'@aparte/core': patch
---

**The artifact card's tab row and its heights.** Three things, all reported from the
landing.

**Code comes first, and the pair sits with the other controls.** The card opens on Code —
mounting the preview would execute model-authored code with no gesture — and a selected
tab sitting *second* reads backwards. DOM order is also keyboard order, so the tab a
reader reaches first is now the one already showing. The pair is right-aligned, under the
header's copy/download buttons, so every control is in one column.

**The tab row declares its own layout.** Core is light DOM on purpose: no shadow root, no
`::part()`, any selector reaches in — and the corollary is that a component must state
what its layout depends on, because an undeclared property has nothing to override a
host's rule with. A page with a bare `nav { justify-content: space-between; padding-top:
30px }` was pushing the card's `<nav>` tabs to opposite ends and padding the row out.
`justify-content` and the padding are declared now.

**Six hardcoded heights become variables**, each with its default in its read
(`var(--x, 480px)`), the way every other value in that file already works:

| | default |
|---|---|
| `--aparte-artifact-frame-height` | `480px` |
| `--aparte-artifact-frame-max` | `70vh` |
| `--aparte-artifact-body-max` | `600px` |
| `--aparte-artifact-pending-height` | `120px` |
| `--aparte-artifact-file-code-max` | `360px` |
| `--aparte-artifact-file-preview-max` | `460px` |

The preview frame stays a **fixed** height rather than an aspect ratio, which is what
embeds of arbitrary HTML actually do — CodeSandbox documents `500px`, StackBlitz takes a
height parameter — because a frame with an opaque origin cannot be measured, and a 16/10
ratio on a wide card is enormous. What was missing is the `70vh` cap: a fixed 480px should
not own a phone screen.

Two incoherences went with it: the code pane repeated the body's `600px` (two owners of
one number), and the "press Preview" placeholder was `120px` tall inside a body whose
`min-height` said `80px`, so that minimum applied to nothing.
