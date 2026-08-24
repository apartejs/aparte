---
'@aparte/core': patch
---

**A code block is coloured while it streams, not after it.** Reported from the screen: an
artifact's code pane flickered between plain white and syntax colours on a dark theme.

The debounce was innocent. Every token ran `codeEl.textContent = content`, which destroys
the highlighter's `<span>`s — so a token erased whatever the last debounce had painted.
Plain most of the time, one coloured frame every 400ms. The `code` **segment** had the
mirror-image bug: no colour at all until stream-end, behind a comment explaining that a
per-token highlight would be too expensive.

Both are the same missing idea. The pane is now split at the last newline: the prefix of
**complete lines** is highlighted, and the line still being written stays plain in a tail
span that a token can rewrite on its own. Not colouring that last line is deliberate
twice over — it is what makes a token cost one text assignment, and an unterminated string
or brace re-tokenises everything after it, which was the other half of what looked like
flicker.

`streamHighlight` replaces the artifact family's `debounceHighlight` and serves all three
panes (card, binary file, `code` segment). The boundary lives in the DOM rather than a
module map, which is what makes a slow earlier highlight unable to rewind the pane.

**And the artifact's pulse stops when the stream does.** `render()` painted the streaming
indicator and nothing ever removed it, so a finished document went on claiming to be in
flight — every 1.2s, forever. It survived this long because nothing in the repo streamed
an artifact: the card had only ever been handed settled content, so its streaming
affordances had never once been exercised.
