---
"@aparte/core": patch
---

The composer no longer sits flush against the bottom edge of the chat.

Spotted in two live apps: as soon as a conversation started, `center-empty` stopped
centering the composer and it touched the bottom of the screen. That was an **asymmetry in
core's own spacing**, not a layout choice — the viewport puts 16px between the last bubble
and the composer, and there was nothing below it.

It is core's to fix rather than the app's, because an app cannot express it from outside:
padding the container also shrinks the scroll area, so the transcript would stop before the
edge instead of scrolling to it.

New token, with the same 16px the viewport already uses on its other sides:

```css
/* flush composer — a full-bleed mobile shell with a docked keyboard */
aparte-chat { --aparte-chat-bottom-gap: 0; }
```

Visible change: every full-height chat gains 16px under its composer. Applies to the
vanilla element and to all four wrappers.

A **patch**, not a minor: this corrects an asymmetry in core's own spacing, and the new
token is the escape hatch for the correction — a way back to the previous rendering — not
a capability anyone asked for.
