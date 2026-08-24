---
'@aparte/core': minor
'@aparte/plugin-model-selector': minor
---

**A live config change now reaches an open question and the model selector.** They were
the last two components a language switch could not touch, and each was stuck for a
different reason.

**The elicitation panel kept no reference to itself.** `Pending` held
`{ settle, composer }`, so when the locale changed there was nothing to relabel — the
question a user was looking at stayed in the previous language. Rebuilding was never the
alternative: the reader may be halfway through typing an answer, or three questions into
a form.

So `BuiltElicitationPanel` gains **`relabel()`**, bound by the same rule as a segment
renderer's: text and attributes only, no node added or removed. The panel collects one
closure per string it takes from the locale, *while it is being built and only when it
takes it* — which is what keeps a `trueLabel` the tool supplied from being overwritten
by `elicitationYes`. Four sites: the "Other…" option (title, placeholder and accessible
name), the yes/no labels, and the last-resort answer label. The presenter keeps the panel
and its Skip button in `Pending`, subscribes with the public
`subscribeConfigChange`, and re-texts both.

Asserted in pairs — the strings moved, *and* a half-typed answer is still there, in the
same node.

**Fixed in passing, found by one of those tests:** an elicitation with an empty
`message` gave its input `aria-label=""` — no accessible name at all. The chain was
`field.title ?? field.description ?? fallbackLabel ?? t('elicitationAnswerLabel')`, and
`??` treats `''` as a value, so an empty message won. It is `||` now: an empty title is
not a name.

**The model selector was subscribed, and guarded past it.** Its handler returns early
unless the *model* config changed, so a language switch reached it and was dropped —
leaving `modelSelectorPlaceholder`, the one string it takes from the locale and the only
one visible before the list is opened, in the previous language.

The guard stays, because it earns its place: a full re-render re-loads every provider's
models asynchronously and would close an open dropdown and discard a typed search. What
it gained is a cheap path — one attribute, in place. Measured with a MutationObserver
rather than claimed: with the fix, a language switch produces exactly one mutation,
`attr:placeholder`; without it, **zero** — which is the defect, stated as a measurement.
An explicit `placeholder` attribute still wins, as it does at render time.
