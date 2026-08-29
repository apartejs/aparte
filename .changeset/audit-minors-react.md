---
"@aparte/react": patch
---

`<AparteUi>` applies its props to a freshly created element when only `name` or `events` changed, so a memoized prop bag is no longer lost.

Changing either of those two recreates the element. The props effect then had nothing to react to — the bag was the same object — so a `useMemo`'d `props` never reached the new element and the surface came up bare. React now follows the order Vue, Svelte and Angular already used: create, then apply.

`useAparteClient`'s JSDoc says `options` is read once, on mount.
