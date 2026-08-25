---
'@aparte/core': patch
---

**The sanitizer's `--aparte-*` refusal can no longer be walked past with a CSS escape.**

Core's whole theme is custom properties, so the sanitizer keeps a model-authored `--shiki-light` and refuses `--aparte-primary`: setting ours would repaint the chat around whatever element a markdown or highlight provider produced. That is defacement with the library's own paint, not highlighting.

The refusal was spelled `!prop.startsWith('--aparte-')` and tested the name **as written**, so `--\61 parte-text` did not match and survived, and the browser decodes that ident back to `--aparte-text`.

The asymmetry is worth naming, because it is why one of the two checks in `scrubStyle` was fine and the other was not. `SAFE_STYLE_PROPS.has(prop)` is an **allowlist**, and an escape defeats itself against one: `col\6fr` is not in the set, so the declaration dies. The custom-property test is a **denylist** — anything except ours — and an escape defeats a denylist the other way round, by making the name not match the thing being refused.

Refused rather than decoded, which is the rule this file already applies to declaration VALUES for a stated reason: decoding is the general fix and is easy to get wrong — stripping the escape from `u\72 l(` yields `ul(`, not `url(`, which is how an earlier attempt at it passed its own test. No custom property worth setting from model-authored content needs a CSS escape.

The fix does not rest on how any particular engine decodes anything: the invariant is that the namespace is unreachable, and it now holds because no backslash survives in a property name rather than because of a prediction about what one would become.

Impact was bounded — custom properties inherit downward only, and `url()` / `expression()` / `javascript:` and every layout property were already refused, so this was defacement of the injected element's own subtree with no script, no beacon and no clickjack. Found by the 0.11.0 cold audit and reported as PLAUSIBLE rather than confirmed, since it rests on a spec reading no browser run was available to check; the fix is testable at our own layer, which is what made it actionable.
