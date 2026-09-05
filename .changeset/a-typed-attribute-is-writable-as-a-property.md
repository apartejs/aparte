---
"@aparte/core": patch
---

`<aparte-composer placeholder="…">`, `<aparte-composer disabled>` and `<aparte-context window={8000}>` no longer throw under React 19 and Svelte, and `<aparte-suggestions suggestions='[…]'>` renders its chips. `AparteUiHandle` is now exported from `@aparte/core` — the contract each wrapper's `<AparteUi>` handle re-exports.

React 19 and Svelte assign the PROPERTY whenever the element has one of that name, and only fall back to the attribute when it does not. `placeholder`, `disabled` and `window` were getter-only, so the assignment threw `Cannot set property … which has only a getter` and took the render down — on a spelling both wrappers' typed template surfaces declare valid. They have setters now, `disabled` through `presenceOn` so the documented `''` means ON (#62).

`<aparte-suggestions>`'s setter took an array only, while the attribute it mirrors carries the JSON string form and its own docblock calls the two channels equivalent. A React or Svelte template handing it that string failed `Array.isArray`, the list became `[]`, the attribute was never written and `attributeChangedCallback` never ran: no chips, no warning. The setter takes `AparteSuggestion[] | string` and routes a string through the same parse the attribute uses.

`AparteUiHandle` moves here for the reason `AparteChatImperativeApi` did: it was four hand-written copies, each docblock promising "the same contract on all four wrappers", and it had already drifted once.
