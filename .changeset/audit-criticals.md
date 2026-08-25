---
'@aparte/core': minor
'@aparte/engine': minor
'@aparte/angular': minor
---

**Four critical defects from the 0.11.0 cold audit.** Each one is a place where two things had to agree and nothing checked that they did.

**A refusal's words now reach the model on the engine path too.** `runStreamAgent` hardcoded *"Tool execution was rejected by the user."* and never read `decision.instruction` — which its own resolver type declares and core's inline loop uses. So on the recommended path (ratified decision #6), a user who refused a tool and typed "use the staging bucket instead" had those words dropped before the model saw them. Handing the model a turn after a refusal exists *so that it reads the refusal*; there was nothing to read.

The parity suite could not see it: its resolver returned `{ approved }` and never an instruction, so both loops agreed on a case neither ran. It supplies one now, and asserts the sentence survives rather than only that the two sides match — agreement alone passes if both drop it.

**Two chats on one page no longer fight over the presenter.** `<aparte-elicitation>` entered `<aparte-chat>`'s default composition in 0.11.0, so two plain chats each registered on the same config — which held ONE slot. The second clobbered the first (chat A's approval opened under chat B, and answering it there decided A's tool call), and when B unmounted it cleared the slot, leaving A mounted with a working presenter that never re-registered: every later approval and every `ask_user` in A rejected `no-presenter` for the life of the page, silently, because that warning fires once per config.

It is a stack now, each entry carrying the element that registered it, and a request naming a `target` is routed to the presenter in the **same** chat. `AparteElicitationRequest.target` was already documented as "used to resolve WHICH instance presents"; the single slot is what made that impossible.

**New:** `AparteConfig.removeElicitationPresenter(fn)` withdraws one presenter by name. `setElicitationPresenter(presenter, owner?)` takes an optional owner element. `setElicitationPresenter(null)` still means "turn it off" and clears all.

**`hidePanel()` no longer orphans an open request.** The no-token form called the silent teardown, which nulls `onEvict` without calling it — so the documented public call closed an approval panel without telling its owner. The promise stayed pending, the approval `await` has no timeout, and because `requestUserInput` chains each request on the previous one, **no further question or approval on that config was ever presented again**. The old JSDoc justified the silent branch as "what `reset()` needs"; `reset()` calls `_evictPanel()`, which notifies. Both forms notify now, except a token-matched close — that is the owner closing its own panel, and it already knows.

**Breaking, pre-1.0: `[multiple]="false"` used to turn multi-file selection ON.** The bindings generator modelled every boolean attribute as a *presence* attribute, and core has two that are three-state — default on, off only via the literal `"false"`: `multiple` on `<aparte-composer-add-attachment>` and `submit-on-enter` on `<aparte-composer>`. For those, `false` REMOVED the attribute, which the element reads as true. The only value that turned it off was a string no binding could produce and no template type could express.

`true` now writes the empty presence value and `false` writes `"false"`, and the attribute type widens to `boolean | 'false'` so OFF is expressible in React, Vue and Svelte as well. **If you passed `''`/`undefined` to force one of these off, it never worked; pass `false` (Angular) or `'false'` (templates).**

Two attributes join the typed surface, having been read lazily via `getAttribute` and so invisible to the manifest: **`submit-on-enter`** on `<aparte-composer>` and **`action-id`** on `<aparte-composer-action>` — the latter being the only way to tell two custom composer buttons apart.

And `aparte-action-click` now declares its detail type, so Angular's `(actionClick)` emits `AparteActionClickEventDetail` instead of `void` with `$event` discarded.
