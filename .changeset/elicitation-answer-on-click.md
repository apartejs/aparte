---
"@aparte/core": minor
---

`setElicitationOptions({ answerOnClick: false })` makes a single-choice question select-then-send (radios plus the composer's button) instead of answering on the click; the default stays `true`.

A question asked on its own with one choice — an `enum` without `multiple` or a `default`, a `boolean` without a `default` — renders its options as buttons, and the click is the answer. That is the shape every chat product uses and it stays the default; the switch exists for a host that wants a uniform "select, then send" across every question, or the chance to change one's mind before committing. It is the host's policy, like `allowOther` and `layout`: a form of several questions always collects and submits, whatever it says.
