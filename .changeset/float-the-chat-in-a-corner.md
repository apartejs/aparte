---
"@aparte/core": minor
"@aparte/locales": minor
---

Add `<aparte-launcher>`: put your chat inside it and it floats as a button in the bottom corner of the window, opening the chat as a card above it, and as a full-window sheet on a phone.

```html
<aparte-launcher label="Help">
  <aparte-chat></aparte-chat>
</aparte-launcher>
```

The button is the button recipe (solid, primary, large): round with a speech bubble, or a pill when you give it a `label`. A click opens the chat, and a second click, Escape, or any control of yours marked `data-aparte-launcher-close` closes it. Opening with the button hands the focus to the composer; `show()` and `open` set from a script move no focus, so a page that restores the saved state on load does not steal it. Closing gives the focus back to the button when it was inside. A closed launcher keeps the chat mounted, so the conversation and the client stay, but out of sight, out of the tab order and out of the accessibility tree — whatever `display` your card sets, inline or by a rule. `open`, `show()`, `close()` and `toggle()` drive it from a script, and `aparte-launcher-toggle` reports every change — including, while the chat is open, the window crossing the breakpoint, so a host that takes its page out of reach under the sheet needs no media query of its own.

Escape closes the launcher unless something inside has the key first: a control that answered it (a menu closing, the context gauge's panel), an input method that is composing, or a modal dialog open in your card, which closes itself on it. The next Escape closes the launcher.

Under `breakpoint` (30rem of window in width or in height unless you set a width, `none` for a card at any size) the open chat fills the window, Tab stays inside it, and the button moves to the top corner — or hides, when your card holds its own close control. The size, the offset from the edges, the gap and the corners are `--aparte-launcher-width`, `-height`, `-offset`, `-gap` and `-radius`.

The locale gains `launcherOpen` and `launcherClose`, the button's accessible name when it shows no text, translated in the nine languages of `@aparte/locales`. The icon provider gains `messageSquare`, the closed button's glyph, and the button asks for `launcherOpen` and `launcherClose` first, so a theme redraws the button alone (`registerIcons`) without redrawing every close button in the chat. The button reads them from the chat inside it when that chat carries its own config (a wrapper's `config` prop, `attachConfig`), and from the page's config otherwise, so a French chat gets a French button without a global setting.

On a server-rendered page, hold the launcher with `defer-hydration` — on it, or on an element around it — and release it with `releaseDeferredHydration` once your framework has hydrated, as the launcher page shows. The launcher draws its button when it connects, and hydration removes what it did not render; if something removes the button anyway, the element puts it back.

The context gauge now answers an Escape pressed inside it on its own element, and stops and default-prevents it: an element around a gauge that listens for Escape no longer sees that press, which is what lets a launcher or a dialog around it stay open under the panel. An Escape from elsewhere still closes the panel and is left to whatever else listens for it.

The docs' Support widget template is now built on it, in place of the launcher it drew by hand.
