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

## What works today, and what does not

**Markup replacement is complete** — a Bootstrap or Tailwind renderer returns a string and
everything, including the click wiring, works. There is an end-to-end test: a substituted
`<a>` renders inside `<aparte-composer-send>` and core still finds and wires it.

**A framework component is not finished.** `updateControl` is implemented and tested, but
core's own **19 state-write sites still write the DOM directly** rather than routing through
it — the send button's four modes among them, which is the most stateful code in the
composer and not something to convert in a hurry. Until they move, a component-based
renderer will render correctly and then not see `disabled` or icon changes.

Stated rather than shipped quietly, because a seam that is 90% there is exactly the kind of
thing that gets discovered by a consumer instead of by us.
