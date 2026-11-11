---
'@aparte/core': minor
'@aparte/locales': minor
---

`<aparte-launcher>` now draws a header over its card: the assistant's avatar, a title, a ✕ that closes the chat, and with `maximizable` a button that maximizes the chat. `header="false"` removes it.

A card that brings its own header keeps it and gets none: a `<header>` at the card's top level. If your card has a header written another way, set `header="false"`.

```html
<aparte-launcher label="Help" heading="Kilnhouse support" subheading="Usually answers in a minute" maximizable>
  <aparte-chat></aparte-chat>
</aparte-launcher>
```

- `heading` is the title (unset: the button's `label`, else the locale's `launcherHeading`, "Chat"; empty: no title), `subheading` a line under it. The avatar is the assistant's, drawn by the config's avatar provider as in the messages (`setAvatarProvider`); there is none without a provider.
- `maximizable` adds the button beside the ✕. Maximized, the chat fills the window on any screen — the sheet a phone already gets: the header on top, Tab kept inside — and the same button brings the card back. `maximizable="panel"` keeps the page in view instead: a panel the window's height along the inline-end edge (the right, on a left-to-right page), `--aparte-launcher-panel-width` (36rem) wide. Escape brings a maximized chat back before a second Escape closes it. The state is `maximized`, an attribute the element reflects and a property, and `maximize()` / `restore()` set it from a script, as `show()` / `close()` do for `open`. Under the breakpoint the sheet hides every maximize control: it already fills the window.
- `covers` (a property, and a field of the `aparte-launcher-toggle` detail beside the new `maximized`) says when the open chat covers the whole window — a sheet, or maximized to the window (a panel as wide as the window counts); set your page `inert` from it.
- In a header of your own, mark a button `data-aparte-launcher-maximize`: it toggles the same state, and the launcher keeps its `aria-pressed`. The sanitizer refuses the attribute in model markup, as it does `data-aparte-launcher-close`.
- `--aparte-launcher-height` now includes the header. The header is at least `--aparte-launcher-header-height` (3.5rem) and grows with what it holds; the card under it takes the rest.
- New icons `maximize` and `minimize`, and three locale keys in every language: `launcherHeading`, `launcherMaximize` ("Expand the chat") and `launcherRestore` ("Shrink the chat").
- `<AparteUi>`, in every wrapper, now turns a boolean that is ON by default OFF with the string `"false"` when its prop is `false`: `header` here, and the composer's `submit-on-enter` and the attachment picker's `multiple`, which `false` used to turn ON by removing the attribute. In JSX, write `header="false"`: the generated types already ask for it.

The header wears the Header recipe. One rule puts it in a brand's colours, its buttons included:

```css
aparte-launcher .aparte-launcher__header {
  background: #1d6fe0;
  border-color: #1d6fe0;
  color: #fff;
}
```
