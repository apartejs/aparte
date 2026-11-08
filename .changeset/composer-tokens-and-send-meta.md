---
'@aparte/core': minor
---

Add tokens to the composer: `insertToken()`, `getTokens()`, `getCaret()`, `getRangeRect()` and `replaceRange()` on `<aparte-composer-input>`.

A token is a pill in the draft that sends a text of its own (`{ label: 'Paul', text: '@paul', kind: 'mention', data: { id: 7 } }`). It reaches `aparte-send` as `detail.tokens` with its place in the message, `AparteMessage.tokens` keeps it, the request carries it as `_meta.tokens`, and the user's bubble draws it as it looked. A message with no token changes nothing.

`aparte-send` also accepts `detail.meta`, kept as the message's `metadata` and merged into the request's `_meta`.

`placeFloating()` is exported: it writes `top` and `left` on a fixed box beside an anchor and turns it when the window ends first.

The `.aparte-menu` recipe gains the row a keyboard is on (`aria-selected`), the row whose submenu is open (`aria-expanded`), and `.aparte-menu__chevron`.
