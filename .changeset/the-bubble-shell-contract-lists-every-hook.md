---
"@aparte/core": patch
---

The bubble-shell contract lists the five hooks it was missing, and a custom shell now gets `role="article"` and its accessible name from the bubble itself.

**Nothing to change.** A shell you already wrote gains the role and the name with no edit. If you wrote one from the old list you are probably missing something, and the new list says what — including the three spans the waiting region needs to draw anything.

`AparteBubbleShellRenderer` enumerated eight class hooks; the bubble looks for more than that. A shell copied from it dropped `.aparte-message-content` (the painted content box, which the bubble hides when the turn has nothing to show), `.aparte-waiting` with its `.aparte-sr-only` label, `.aparte-footer`, and `.aparte-branch-status`.

Two of those fail with nothing on screen to say so, and the contract now names them: without `.aparte-waiting` there is no "thinking" state at all between the send and the first token, and without `.aparte-branch-status` a screen-reader user gets no word that the branch moved — the arrows deliberately do not take focus, so nothing else announces it. The list is also in render order now, and a test builds a shell out of it, so a hook that leaves the documentation goes red.

`.aparte-waiting` needed a second clause, because listing it was not enough: the bubble only SHOWS and HIDES that region — the markup that paints is the shell's. A `.aparte-dots` span holding three `.aparte-dot` spans is what the stylesheet animates, so a shell built from the old bullet had a thinking state only a screen reader could perceive, and the region was literally not visible. The contract says so, this repo's own documented shell renders the spans, and the test counts them.

ARIA is the one thing the list does NOT ask of you. The bubble writes `role="article"` and the accessible name onto your root after your shell renders — so every shell that exists gains an article and a name with no author action — unless the root already declares a `role`, which is how you override it. A markup contract that also demanded a `role` would lose it the first time somebody forgot one, silently, which is exactly what had happened.

One containment is load-bearing and is now stated: `.aparte-message-content` HOLDS `.aparte-segments`, `.aparte-content` and `.aparte-waiting`. The background, radius and padding of a user message are declared on that box, so a shell that renders the three as its siblings keeps every behaviour and loses the bubble. The contract also names the two classes that carry the default layout and nothing else — `.aparte-body` and `.aparte-header` — which the bubble never queries, so a shell laid out differently can drop both.
