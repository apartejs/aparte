---
'@aparte/core': minor
---

Ready-made button classes. Put `aparte-btn` on a `<button>` and it looks like every
other control in the library.

```html
<button class="aparte-btn aparte-btn--primary my-send">Send</button>
<button class="aparte-btn aparte-btn--icon" aria-label="Copy">…</button>
```

Your own class stays on the element — for events, and so a consumer can target that
one button. It just stops carrying the look.

**Nothing existing changed.** This is a new sheet and twelve new tokens; no rule was
touched, so no pixel moved. Adopting it in the library's own 27 controls is the next
step, not this one.

### Measured, not invented

The 33 control rules already in this library were read, and the base is what they
agree on: flex-centred, transparent, borderless, `cursor: pointer`, `flex-shrink: 0`.
What they did **not** agree on is why the file exists — `transition` appeared in 13 of
them with 12 different values, `border-radius` in 12 with 11. Nobody decided; everyone
filled in.

The variants come from the same reading, and the set is short on purpose:

| class | what it is | controls already like this |
| --- | --- | --- |
| `aparte-btn` | ghost — transparent, muted | 33 |
| `aparte-btn--surface` | raised: has its own ground and border | 3 |
| `aparte-btn--primary` | filled with the accent | 2 |
| `aparte-btn--success` | tinted, not filled | 2 |
| `aparte-btn--danger` | tinted, not filled | 1 |

There is no `--secondary`: nothing in this library is secondary, and a variant nobody
wears is a contract maintained for nobody. `--success` and `--danger` tint rather than
fill because that is what the existing controls do.

Shape and size: `--icon` (square, sized by the modifier) and `--sm` / `--lg` around a
default `--md` — 20px, 28px, 36px, the three sizes this library already uses.

`:disabled` lives here once. It was six rules saying the same two declarations.

### Verified in a browser

Every variant rendered and its computed style read: the accent fill resolves to the
brass `rgb(176,125,51)`, the icon sizes to exactly 28/20/36px, disabled to opacity 0.5
and `not-allowed`. And a single `<aparte-chat>` at `--aparte-font-scale: 1.25` gives a
29px button against the default's 22px — the recipe follows the masters, per instance.
