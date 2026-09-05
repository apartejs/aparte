---
"@aparte/core": patch
---

The focus ring, the selected-row mark and the composer's focus border are neutral now, not brass; a theme that wants the accent back sets `--aparte-border-focus`, `--aparte-mark-bar` and `--aparte-select-border-hover`.

What changed on screen, measured on the chat-site example:

- `--aparte-border-focus` is `var(--aparte-neutral)`: every focused control drew a 2px accent ring, which turned a page of controls into a frame gallery. The ring is still 2px, outside the box, on `:focus-visible` only.
- `--aparte-mark-bar` is `0px`: the accent bar on the start edge of a chosen row (the active conversation, the selected option, a checked choice) is gone; the tint and the text weight carry the mark.
- A checked `.aparte-field-choice` lifts a step (`--aparte-surface-2`) instead of taking an accent border and tint: the radio or the box shows the choice.
- The composer shell's `:focus-within` border is `--aparte-text-muted`, a contrast step on the hairline rather than the accent.
- The select trigger's hover border is `--aparte-text-muted`; a keyboard-active option wears the focus ring's colour rather than the accent.
- Conversation rows read in `--aparte-text`, the group headings stay muted: the two no longer looked alike.
