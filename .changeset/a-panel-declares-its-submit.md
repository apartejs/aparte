---
'@aparte/core': minor
---

A panel says whether the composer's button has an act, and a single choice settles on the click.

`showPanel({ mode })` takes a third value, `'none'`: this panel has nothing for the send
button, so it is not drawn. Flip to `'submit'` with `setPanelSubmitEnabled` the moment the
panel grows an act. The type is exported as `AparteComposerPanelMode`.

**Why it was missing.** The composer's panel mode was ONE fixed policy — hide the text
input and the attachment picker, keep the strip and the toolbar, and always keep the send
button. A panel could supply DOM, two callbacks and an enabled flag; it could not say "my
options settle themselves". So the approval panel, whose options have settled on the first
click since they became buttons, sat next to a permanently disabled button offering an act
that did not exist. Ratified decision #8, one control further along.

**What changes for a user.** A question asked on its own — one choice, or one yes/no — is
now a column of buttons, and the click is the answer. One gesture where there were two,
and no submit beside options that already are the answer.

This is the accessible reading, not a trade against it. WCAG SC 3.2.2 ("On Input") and its
F36 failure forbid submitting automatically when an *input* is given a value: a radio that
fires on change is exactly that, which is why these options are buttons — an explicit
activation is what F36 says to rely on instead. Auto-advancing radios is separately a
documented barrier, because it removes the chance to review a selection; a command button
has nothing to review. The group's role moves from `radiogroup` to `group` to match, and
keeps its accessible name.

**What deliberately does not change**, each for a measured reason:

- **A form of several questions.** Settling on its last question would be F36 word for
  word, and auto-advancing between them is the barrier above. Chips, advance and submit
  are untouched.
- **A multi-select and a free-text question.** Both accumulate, so both need a commit.
- **A choice carrying a `default`.** A button cannot be pre-selected, and a requester that
  supplied one asked for a pre-filled answer it can review before sending — MCP's "clients
  SHOULD pre-populate". That shape keeps its radios and its submit.
- **"Other…"**, which is not an answer but a request to write one: it opens the field and
  hands the button back its meaning.

A consumer who wants pick-then-submit for a single choice registers an
`AparteElicitationFieldRenderer` for `enum`; a field renderer never settles.

`buildElicitationPanel` gains `onSettle`, the contract `buildApprovalPanel` already had.
