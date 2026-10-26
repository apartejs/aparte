---
"@aparte/core": minor
"@aparte/locale-fr": minor
---

Add `<aparte-launcher>`: put your chat inside it and it floats as a button in the bottom corner of the window, opening the chat as a card above it, and as a full-window sheet on a phone.

```html
<aparte-launcher label="Help">
  <aparte-chat></aparte-chat>
</aparte-launcher>
```

The button is the button recipe (solid, primary, large): round with a speech bubble, or a pill when you give it a `label`. A click opens the chat, and a second click, Escape, or any control of yours marked `data-aparte-launcher-close` closes it. Opening hands the focus to the composer; closing gives it back to the button. A closed launcher keeps the chat mounted, so the conversation and the client stay, but out of sight and out of the tab order. `open`, `show()`, `close()` and `toggle()` drive it from a script, and `aparte-launcher-toggle` reports every change — including, while the chat is open, the window crossing the breakpoint, so a host that takes its page out of reach under the sheet needs no media query of its own.

Under `breakpoint` (30rem of window unless you set it, `none` for a card at any width) the open chat fills the window, Tab stays inside it, and the button moves to the top corner — or hides, when your card holds its own close control. The size, the offset from the edges, the gap and the corners are `--aparte-launcher-width`, `-height`, `-offset`, `-gap` and `-radius`.

The locale gains `launcherOpen` and `launcherClose`, the button's accessible name when it shows no text, translated in `@aparte/locale-fr`. The icon provider gains `messageSquare`, the closed button's glyph.

The docs' Support widget template is now built on it, in place of the launcher it drew by hand.
