---
'@aparte/core': minor
---

Every control core renders now goes through one builder, and the classes it writes are
derivable from the element that owns them.

**BREAKING for themes**: six class names change. They are listed in full below.

## Why this was not a naming preference

Five of those names were *contractual*. Each composer part does
`if (this.querySelector('.aparte-XX-button')) return;` — that exact string is how a
consumer suppresses core's own render, and the JSDoc says so, so it is published on the
catalogue page. The strings were `.aparte-cs-button`, `.aparte-cc-button`,
`.aparte-caa-button`, `.aparte-cact-button` and `.aparte-ci-editor`: initialisms of the
tag that only their author could expand. **A published contract nobody can spell is not
a contract.**

The sixth was a collision. `.aparte-action-btn` (every button in the bubble's action bar)
and `.aparte-action-button` (the shared icon-button look, worn by two composer parts and
nothing in the bubble) sat one letter apart, on different elements, with different looks.

## The rule, so the next component does not invent a seventh

**For an element `<aparte-X>`, its internal parts are `.aparte-X__part`.** Derivable from
the tag: nothing to invent when a component is added, nothing to look up when one is
themed. It lives in `utils/control.ts` next to the builder that applies it.

A conventional abbreviation stays — `btn` in `--aparte-radius-action-btn`, `nav`, `img`.
The line is whether a reader who has never seen the code can expand it, which is why the
CSS *variables* are untouched.

| before | after |
| --- | --- |
| `.aparte-cs-button` | `.aparte-composer-send__button` |
| `.aparte-send-button` | `.aparte-composer-send__button` (merged — same button) |
| `.aparte-cc-button` | `.aparte-composer-cancel__button` |
| `.aparte-caa-button` | `.aparte-composer-add-attachment__button` |
| `.aparte-cact-button` | `.aparte-composer-action__button` |
| `.aparte-ci-editor` | `.aparte-composer-input__editor` |
| `.aparte-action-button` | `.aparte-control` |
| `.aparte-action-btn` | `.aparte-chat-bubble__action` |
| `.aparte-action-copy` · `-edit` · `-retry` · `-info` · `-feedback-pos` · `-feedback-neg` · `-custom` · `-edit-save` · `-edit-cancel` | `.aparte-chat-bubble__action--<same suffix>` |

## A latent bug the builder fixes on the way

**Fourteen of core's controls rendered a `<button>` with no `type`.** Inside a form that
defaults to `type="submit"` — so a composer or a bubble dropped into a consumer's
`<form>` submitted it on every copy, retry, send or branch click. `controlMarkup` and
`createControl` always write `type="button"`, so the fix is structural rather than
fourteen edits waiting to be forgotten on the fifteenth control.

They also centralise the escaping: the label lands on `aria-label` and `title`, and both
those and every `data-*` value are escaped in one place instead of at each call site.
That removed 27 hand-written attribute interpolations, which is why
`check:attr-escaping`'s seen-floor drops 100 → 80 in the same commit, with the reason
recorded next to it. `controlMarkup` is registered in `TRUSTED_MARKUP_CALLS` as a
contract rather than exempted at each of its call sites.

## Two rules deleted, and one thing deliberately left alone

`aparte-composer-dictate` **does not exist** — no element, no class, nothing anywhere in
the repo — yet three CSS rules were scoped to it and styled a `.aparte-cd-button` nothing
ever rendered. Both are gone.

`.aparte-actions-left` / `.aparte-actions-right` are gone too: ratified decision #4 rules
out positional names in a public surface — a name a right-to-left locale contradicts is a
name that will lie — and nothing in the repo referenced them.

**Names that are merely not-BEM were NOT renamed.** `.aparte-scroll-btn`,
`.aparte-branch-prev`, `.aparte-code-copy`, `.aparte-message` are readable and collide
with nothing; churning them would widen the break for no reader's benefit. They do now go
through the builder, so they gained `type="button"` and a single definition of what a
control is. The rule above governs what gets added next.

The legacy composer CSS block (`.aparte-editor`, `.aparte-input-container` and siblings)
is untouched: several of those rules are the only declaration site of documented CSS
variables, and `.aparte-model-select` — which core never emits, so a first pass called it
dead — turns out to be documented in all four framework guides. Sorting the dead from the
consumer-facing there is its own lot, with its own verification.
