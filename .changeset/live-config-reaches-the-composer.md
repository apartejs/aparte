---
'@aparte/core': minor
---

**A config change now reaches the composer, and `subscribeConfigChange` is the hook for your own elements.**

The docs promise that "a locale switch is live: mounted components re-render
immediately". It was half true. Twenty-one files read a config-derived value — an
icon, a locale string — at render time, and sixteen never re-read it. Among them all
four composer controls and the input, each of which renders once behind an
early-return guard, so an icon set or a language chosen after the first render never
reached them.

Most of that surface is **invisible**: accessible names and tooltips. Only the
input's placeholder is text a sighted user reads. That is why it went unnoticed —
nothing on screen was ever in the wrong language.

**New: `subscribeConfigChange(el, handler)`** (exported, and from the Node entry
too). It owns the event name — previously a string literal repeated in five
components — and the scope rule that decides whether a change belongs to *this*
element. The config is resolved per event, never captured when subscribing:
`AparteChatStatus` documents why, having been made "permanently deaf to its own
instance" by exactly that mistake.

**Fixed, with a targeted refresh in each — never a re-render:**

- `aparte-composer-input` — the placeholder and its accessible name.
- `aparte-composer-send` — the icon and label for whichever of its four meanings the
  button currently carries. It remembers the last `panel-change` payload now, which
  it previously read out of the event's arguments and discarded, so nothing could
  recompute the chrome afterwards. Its streaming label was the bare literal `'Stop'`
  and is localized.
- `aparte-composer-cancel` — icon and accessible name, without touching `hidden`.
- `aparte-composer-add-attachment` — icon, label, tooltip.
- `aparte-composer-action` — icon only: its label is the consumer's `label`
  attribute, so a locale change is correctly a no-op there.
- the bubble's **avatar provider**, which was the one provider a live change never
  reached — swap the set and every bubble already on screen kept the old one.

Why targeted and not a re-render: `_render()` returns early once its button exists,
and its own disabled/hidden/mode computation ignores state that lives on the composer
root. Rebuilding would put a send glyph back while a reply was still streaming,
un-hide a stop button, drop out of answer mode with a question panel open, and take
the focus off the control most likely to be holding it.

Ten tests, both halves seen to fail: disabling the seam reddens nine of ten, and
removing the send button's mode dispatch reddens exactly its two streaming cases.

**Still stale, and deliberately not in this change:** the segment renderers'
config-derived text (a code block's copy button, a tool call's Approve/Reject, a
terminal's labels). Refreshing them by re-rendering the segments container was
audited and rejected — it destroys a running artifact preview, reverts a reasoning
block a reader had expanded, resets scroll inside long panes, and does not even
localize the strings that were never routed through `t()` in the first place. It
needs a narrow `relabel` hook on the renderer contract, which is its own change.
`aparte-elicitation` and the model-selector plugin are also still to do, each for a
specific reason recorded in that audit.
