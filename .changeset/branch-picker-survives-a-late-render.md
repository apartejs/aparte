---
'@aparte/core': patch
---

**The branch picker no longer collapses to "1 / 1" and lose a retry fork.** In framework-managed mode — `@aparte/react`, `@aparte/vue`, `@aparte/svelte`, `@aparte/angular` — pressing ‹ after a retry could land the sibling label on "1 / 1" instead of "1 / 2". The picker then hid itself and **the other version became unreachable for the life of the page**: the fork was gone.

The cause was not where it was first suspected. `syncRepoFromMessages` was the obvious candidate, because it syncs from the framework's array which holds the active path only — but it never deletes, it only appends and updates, so it cannot lose a tree.

It was `_applyPendingSiblings`. It read each sibling's bubble, `continue`d past the ones not on the page yet, and then cleared `_pendingSiblings` unconditionally — so a callback running one tick early **discarded** the branch counts with nothing left to retry. The bubble arrived a moment later showing its default of one sibling.

Which needed a framework that renders late, and they all do. React implements `afterRender` as `requestAnimationFrame(() => cb())`: a bet that the next paint lands after React's commit. It does not always, and this repo has lost that same bet before (`25f356b`, "the stream-sync flake had a cause — a bet on rAF phase").

The fix reschedules instead of dropping, bounded at six render passes — the race needs one, and a message that has left the active path has no bubble and never will, so an unbounded retry would hold a callback forever. **It lives in the host rather than in React's rAF call**, because any binding whose `afterRender` can precede its commit hits this, and one fix there covers all four wrappers.

Two things this was hiding behind:

The e2e test named *"retry forks a branch and the ‹1/2› picker navigates between versions"* asserted `toContainText('1')` — which `"1 / 1"` satisfies exactly as well as `"1 / 2"`. It never distinguished "back to version 1 of 2" from "lost a branch", and the defect sat under a green suite through four cold audits. The strict assertion now runs on **every** mode, not just native.

And the host's unit-test harness renders bubbles synchronously inside `setMessages`, with `afterRender: (cb) => cb()` — modelling a framework that commits during the setter, which none of the four do. `pending-siblings-race.test.ts` models the real ordering and reproduces the defect without a browser.
