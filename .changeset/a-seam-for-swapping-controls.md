---
'@aparte/core': minor
---

`setControlRenderer` — swap every button aparté draws for one of your own.

A class contract lets you **restyle** our button. It does not let you **substitute** a
different one, and that is the gap this closes: a `<p-button>` is not a style, it is another
DOM. Register one function and every control in the library goes through it — send, stop,
attach, the bubble's copy / edit / retry / feedback row, the branch arrows, the code block's
copy, scroll-to-bottom.

One hook for fourteen sites is only possible because they already funnel through one
`AparteControlSpec`. That spec is the contract: its fields are the control's inputs, the
events core dispatches are its outputs, and a replacement honours them by construction.

## Wiring and styling stop sharing a name

Core used to re-query a control it had just rendered **by its class** — nine places did.
That breaks the moment you substitute: a replacement forced to carry
`.aparte-composer-send__button` so core can find it also inherits that class's primary
background. The contract would fight the substitution it exists to enable.

So core now stamps and queries **`data-aparte-control="<part>"`**. An attribute carries no
styling, so your `<p-button>` can wear it and still look like PrimeNG's — and it is stamped
for you if your renderer did not write it. The class stays purely the styling contract.

## Two halves, because one of them is a silent failure

`render(spec)` returns an HTML string, an `HTMLElement`, or `null` to leave that control to
the default — so a partial swap needs no exhaustive switch.

`update(node, spec)` is optional and exists because **core writes state directly on the node
it holds**: `disabled`, `hidden`, and the icon when the provider or locale changes. On a
`<button>` that is right. On a framework component it does nothing — setting `.disabled` on
a `<p-button>` host touches no `@Input` and runs no change detection. "Core keeps the
behaviour" would break without a sound. So core asks the renderer first and writes the DOM
only as the fallback.

## Both halves work, and both are proven on a real element

A substituted `<a>` renders inside `<aparte-composer-send>` and core still finds and wires
it. And a registered `update` receives the state changes of that same button — the hardest
control in the library, with four meanings and a chrome rewrite on each. Every state write
in core routes through `updateControl`; none writes the DOM directly any more.

`AparteControlChanges` is a **partial** of the spec on purpose. The first version passed a
whole spec and wrote every field, so "disable this" would also un-hide it — and the stop
button, which renders hidden and is un-hidden only by the streaming listener, would have
reappeared on any unrelated update.
