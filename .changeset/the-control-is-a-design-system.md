---
'@aparte/core': minor
---

`.aparte-control` becomes a real control primitive, and `<aparte-button>` is the element over it.

## The class is the primitive

Core is light DOM — no shadow root, no `::part()` — so **a private class does not exist**:
whatever an element renders wears classes any stylesheet can reach. That settles what a "button
primitive" means here. The class carries the design system; the element is a convenience over it.

`.aparte-control` gains four composing axes. The **default of each axis is the base rule and
emits no modifier**, so everything that shipped looks exactly as it did:

| Axis | Default | Modifiers |
| --- | --- | --- |
| Fill | quiet | `--filled` · `--tinted` · `--outline` |
| Accent | neutral | `--primary` · `--success` · `--danger` · `--warning` |
| Size | md (36px) | `--sm` (28px) · `--lg` (44px) |
| Shape | rounded | `--circle` · `--pill` |
| Content | icon-only | `--label` |

They compose because an accent modifier sets the colour role and a fill modifier reads it: four
fills times five accents is twenty looks from nine rules, and a sixth accent costs one rule
rather than four. Put them on a `<button>` of your own and it matches core's:

```html
<button type="button" class="aparte-control aparte-control--filled aparte-control--primary">
```

`--aparte-control-size-sm` / `-lg` and their icon sizes are **declared in `:root`**, not left as
inline `var(x, 28px)` fallbacks — a token that exists only as a fallback reaches no reference
and cannot be discovered.

## `<aparte-button>` earns its tag on three things a class cannot do

Measured, not assumed. Radix ships no Button precisely because `<button>` already has the
behaviour, and that reasoning holds — so the element had to justify itself on something else:

1. **It resolves an icon through the configured provider.** `icon="copy"` becomes whatever
   `getIcon('copy')` returns and follows a provider swap. A class has no way to reach the
   config, so a class-only button ships its own SVG and never inherits the host's icon set.
2. **It guarantees `type="button"`.** Fourteen of core's own controls shipped without one.
3. **It emits a bubbling `aparte-button-click`**, so the four wrappers bind it like any element
   event — and nothing has to read a class or a `data-action` string to know a button was
   pressed.

It carries no behaviour of its own: nothing in core listens for its event, so the app is the
only thing that can make it do something (ratified decision #8).

## One bug the tests caught before it shipped

The size list was written in visual order (`sm, md, lg`) while the default is `md`, and the
lookup fell back to the *first* entry — so an unrecognised `size` silently rendered a small
button with a correct-looking class list. The invariant "first entry is the default" is now
structural rather than remembered: the modifier is computed against `allowed[0]`, not against a
written-out literal that can drift from it.
