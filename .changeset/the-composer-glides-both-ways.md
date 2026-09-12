---
"@aparte/core": patch
---

The centred composer glides to the bottom when a conversation opens, the way it already glided back up when a new one started. Nothing to change on your side; if you styled `aparte-chat[center-empty][data-empty]` or `.aparte-chat-container--auto-center[data-aparte-empty]` for their `justify-content`, that declaration is gone — the centring is a spacer now.

Measured on the chat site, the top of the composer sampled every 40 ms: a new chat glided 816 → 494 px over about 300 ms, opening a conversation snapped 494 → 816 in one frame. `center-empty` animated the viewport's `flex-grow`, but the viewport also carries `height: 100%` for the scroll chain, and the moment the empty state dropped that height applied at once, leaving `flex-grow` nothing to animate. The other direction removed the height, so `flex-grow` did the sliding.

Under both centring modes (`center-empty` on `<aparte-chat>`, `centerWhenEmpty` on the wrappers) the viewport now keeps one size rule, `flex: 1 1 0%` and no height, and the centring is a `::after` spacer after the composer whose `flex-grow` is 1 while the chat is empty. Only the spacer animates, in both directions. The empty group sits between two equal halves, so the 32 px the empty viewport used to add no longer shifts it, and the first-paint reservation (`:not(:defined)`) grows the same spacer. Under `overlay-composer` the spacer does not animate: the first message takes the viewport out of the flow, and a spacer still shrinking would drop the composer from the top of the column — the overlay's composer snaps to the bottom, as it always did.
