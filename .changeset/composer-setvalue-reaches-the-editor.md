---
'@aparte/core': patch
---

`<aparte-composer>`'s `setValue()` now reaches the editor, so it prefills the visible
field instead of only staging what a send would submit.

It used to do half of what its name says. `<aparte-composer-input>` listened for the
composer's value but acted on the empty string alone — `if (value === '' && …)` — so
`composer.setValue('draft')` changed what `submit()` would send while the field went on
showing whatever was there. Worse, the value then vanished at the first keystroke,
because every keystroke pushes the editor's real content back up. The failure was silent
and deferred: nothing appeared, nothing threw, and the staged text was gone by the time
anyone noticed.

Nothing in this repo relied on it — all five examples pair `setValue(text)` with an
immediate `submit()`, and that path is unchanged. The consumer it hurt is the one doing
the obvious thing: a "reply with this template" button, a restored draft, a quoted
citation.

**The `''` special case is gone rather than widened.** The listener now compares instead:
a value the editor already holds is not written, which is why typing does not rewrite the
DOM under the caret — the keystroke that just travelled up comes straight back equal.
Everything else is applied, and the post-submit clear is simply the case where that value
is `''`. Sending attachments with no text still writes nothing, since there was nothing
to clear.

The comparison is against `value.trim()` because `getValue()` trims. Without that, a
padded value never looks equal and the mirror back through `setValue` re-enters forever —
removing the comparison in a sabotage run raises `Maximum call stack size exceeded`, and
the test that pins the caret behaviour fails on a destroyed `<br>`.
