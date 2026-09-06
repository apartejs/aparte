---
"@aparte/core": patch
---

The thinking block reads `--aparte-thinking-bg` and `--aparte-thinking-content-bg`; both default to `transparent`, so nothing changes on screen.

**Nothing to change.** If you set either token, it now does what its name says.

Both were declared and read by nothing: the reasoning block hard-coded `background: transparent` on the rail and on the panel, so a theme that set either one was setting a decoration. Wiring them without moving a pixel is the whole point — the default is exactly the value the two rules used to hard-code, which is also why the two declarations move from the derived layer to the literal palette (`transparent` is a literal, not something derived from a master).

```css
aparte-chat {
  --aparte-thinking-bg: var(--aparte-surface-2);
  --aparte-thinking-content-bg: var(--aparte-surface-1);
}
```

That turns the understated left rail into a filled card, which is a look, not a default.
