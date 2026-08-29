---
"@aparte/core": minor
---

The user bubble's tint, `--aparte-surface-3` and `--aparte-text-inverse` derive from the masters; an eight-line rebrand now moves them, and the default user bubble is a wash of the accent rather than a fixed plum.

`--aparte-message-content-bg-user` was a literal in both palettes (`#efe7f6` / `#2f2740`), the one colour the theming guide's eight-line rebrand could not reach — a chat moved to a blue brand kept a plum bubble. It is now `color-mix(in srgb, var(--aparte-primary) 12%, var(--aparte-surface-1))`, declared in the anchored layer so a per-instance `--aparte-primary` re-tints it. `--aparte-surface-3` is the second surface pulled 6 % toward the text (the same figure both literal pairs encoded), and `--aparte-text-inverse` reads `--aparte-surface-1`. The three names still exist and still win when you declare them — only their defaults moved. The theming guide lists what stays literal after this: the status colours and `--aparte-secondary` / `--aparte-neutral`.
