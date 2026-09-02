---
"@aparte/core": patch
---

The composer's editor is exactly the control height at rest: its block padding derives from the control size and its own line (`--aparte-input-padding-y: calc((var(--aparte-composer-control-size) - 1lh) / 2)`), so the send and attachment buttons share the editor's centre on one line and follow its last line when the text wraps.

Measured on the built preview at 768: 36px buttons beside a 44px editor (10px of padding, a 24.3px line, 10px of padding) in a row aligned at the end, so the send button sat 4px below the editor's centre. A consumer who had set `--aparte-input-padding-y` keeps what they set; the default alone moves.
