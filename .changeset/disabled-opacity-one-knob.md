---
'@aparte/core': minor
---

One value for "this control is disabled": `--aparte-disabled-opacity`, default `0.5`.

Seven disabled states carried five different opacities — `0.3`, `0.45`, `0.5`, `0.5`,
`0.55`, `0.6`, `0.6` — and not one of them had a comment saying why, so there was
nothing to preserve in keeping them apart. They all read the token now.

Deliberately ONE knob rather than Material 3's `content` / `container` pair: that
split exists to tint a container's background separately from its text, and every
case here is a whole control fading. And not Bootstrap's per-component variable
(`--bs-btn-disabled-opacity`) either — a variable per family is the drift this
removes, with names on it.

### Visible

| | before | after |
| --- | --- | --- |
| `.aparte-branch-prev\|next:disabled` | 0.3 | 0.5 |
| `.aparte-editor[contenteditable="false"]` | 0.6 | 0.5 |
| `.aparte-ci-editor[aria-disabled="true"]` | 0.6 | 0.5 |
| `aparte-composer[data-model-gated]` | 0.55 | 0.5 |
| `.aparte-send-button:disabled` | 0.45 | 0.5 |

The branch arrows are the one real change: at `0.3` they were the faintest disabled
thing in the library, and they now match everything else.

Untouched, because they are not the same thing: 21 `opacity: 0|1` (that is show/hide,
not a design value) and 8 decorative fades on states that are not disabled — a muted
label, a hovered icon, an archived conversation.

### Still open, and separate

`aparte-composer[data-model-gated]` puts the opacity on a CONTAINER, and core renders
into the light DOM — so it also fades whatever the consumer slotted into
`above-composer` and the toolbar. That is precisely why Carbon, Ant Design and Fluent
use dedicated disabled *colours* rather than opacity. Whether a gated composer should
fade at all, or change colour, is a design question this token does not settle.
