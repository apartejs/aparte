---
'@aparte/core': minor
---

A neutral UI layer: ready-made classes for every native HTML control, plus the display
and surface primitives a UI library is expected to have.

The layer is NEUTRAL on purpose — it is what a UI library offers, not a summary of what
this repo uses. A variant nothing wears still ships, because the plugin that needs it is
not written yet, and its absence is what makes an author invent a seventh shade of
orange.

### The button, rebuilt on two axes

An **intent** says which colour a button means; a **fill** says what to do with that
colour. Seven intents (primary, secondary, neutral, info, success, warning, danger)
times five fills (ghost, solid, outline, soft, surface) is thirty-five buttons out of
twelve classes, and every combination works because neither axis knows about the other.

```html
<button class="aparte-btn aparte-btn--primary aparte-btn--solid">Send</button>
<button class="aparte-btn aparte-btn--danger aparte-btn--outline">Delete</button>
```

Plus `--icon`, `--pill`, `--circle`, `--block`, three sizes, six states (hover, active,
focus-visible, disabled, toggled via `aria-expanded`/`aria-pressed`, busy via
`aria-busy`), and `.aparte-btn-group` with logical joined corners.

Text on a solid fill is INK, not white — measured on every intent this palette declares:
ink wins on six of seven (warning 7.49 against 2.15, success 6.34 against 2.54), white
only on neutral. Three intents reach neither 4.5 with either colour (primary 4.46, info
4.37, danger 4.27); that is the palette's mid-luminance, and it is worth knowing before
you put a normal-size label on a solid button.

### Three new sheets

`field.css` — the shared text-entry recipe on `<input>`, `<textarea>` and `<select>`,
with sizes, a prefix/suffix group, and invalid via `aria-invalid` rather than `:invalid`
alone (which fires before the user has typed). Checkbox, radio, switch and range, each
carrying the intent axis. Label, hint, error, required marker, fieldset. And the five
native controls that were missing: colour, the date and time family, `<meter>` (its
three bands take the three status colours), `<output>`, and a standalone `.aparte-link`.

`display.css` — badge (intents × solid/soft/outline, plus `--dot`), removable tag,
avatar and avatar group, spinner, progress, skeleton, divider, alert, card, `<kbd>`.

`surface.css` — tabs, accordion, menu, popover, tooltip. No dialog, drawer or toast:
those need a portal and a stack manager, and belong to the consuming application.

### Two things the guard learned

**A component may parameterise itself.** `.aparte-btn` declaring `--aparte-btn-intent`
is not the failure the guard watches for — that failure is a theme token derived once on
`:root`, which then cannot follow a palette a subtree overrides. The exemption is narrow:
the name must be prefixed by the component the selector names.

**A component-scoped declaration is not a default.** `--aparte-spinner-size` was declared
on `.aparte-spinner` alone, and the single-owner rule then flagged the fallback that
`<aparte-progress-spinner>` — which does not wear that class — was relying on. Removing
it collapsed the element to `auto`. The rule now only forbids a fallback on a token
declared where every element can resolve it.

### Measured

391 tokens declared and no dangling reference; the fifteen sheets balanced; 22 rendered
families all styled; the tooltip and the layered shadows verified to flip with the dark
theme. `dist/index.css` goes from 135 kB to 219 kB — the new layer is 84 kB, which is
worth knowing for a consumer who only wants the chat.
