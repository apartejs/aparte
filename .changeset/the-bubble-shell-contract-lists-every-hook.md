---
"@aparte/core": patch
---

The bubble-shell contract lists the five hooks it was missing, including the waiting indicator and the branch live region.

**Nothing to change** unless you wrote a custom shell from the old list — in which case you are probably missing something, and the new list says what.

`AparteBubbleShellRenderer` enumerated eight class hooks; the bubble looks for more than that. A shell copied from it dropped `.aparte-message-content` (the painted content box, which the bubble hides when the turn has nothing to show), `.aparte-waiting` with its `.aparte-sr-only` label, `.aparte-footer`, and `.aparte-branch-status`.

Two of those fail with nothing on screen to say so, and the contract now names them: without `.aparte-waiting` there is no "thinking" state at all between the send and the first token, and without `.aparte-branch-status` a screen-reader user gets no word that the branch moved — the arrows deliberately do not take focus, so nothing else announces it. The list is also in render order now, and a test builds a shell out of it, so a hook that leaves the documentation goes red.

One containment is load-bearing and is now stated: `.aparte-message-content` HOLDS `.aparte-segments`, `.aparte-content` and `.aparte-waiting`. The background, radius and padding of a user message are declared on that box, so a shell that renders the three as its siblings keeps every behaviour and loses the bubble. The contract also names the two classes that carry the default layout and nothing else — `.aparte-body` and `.aparte-header` — which the bubble never queries, so a shell laid out differently can drop both.
