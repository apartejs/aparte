---
"@aparte/core": patch
---

The examples the kit pages render are specimens now: the accordion shows three items, the danger alert carries its icon, the skeleton keeps the family's own block height, the app-shell shows a populated sidebar, header and transcript, the split's second pane is a styled document with a colour scheme, the scroll-rail and elicitation examples carry a complete composer, and every chat example is sized in rem. The tool row's approval label reads "Waiting" (was "waiting for you"), the one capitalised word its sibling states use.

Measured on the built previews: 34 of the 59 kit previews render a header example or an `@example` verbatim, so those strings are the showcase, not documentation — and they had been written as excerpts. One accordion item let `:last-child` remove the only rule the family draws; the `--danger` alert without an `__icon` beside an `--info` with one zig-zagged the left column by 23px; `block-size: 64px` inline contradicted the skeleton's `5rem` token; `height: 320px` sheared the chat's first turn at 375. A test now holds the three rules for every sheet and element: enough instances for the relation rules to exist, every documented part present, no hard pixel value against a token of the family.
