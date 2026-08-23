---
'@aparte/core': minor
'@aparte/plugin-ask-question': minor
'@aparte/locale-fr': minor
---

The question panel: right chat, readable schema, replaceable field

Eleven defects in the elicitation surface — the panel a tool puts up when it has to
ask the user something. They survived four from-scratch audits for one reason, and it
is the most useful thing in this release: **no tool ever reached the model, so this
surface was never executed.** Not badly audited. Never run. Its unit tests pinned the
shape it had and said nothing about which chat anything belonged to, what the model
was asked to fill in, or what a screen reader would hear.

One person with a local model broke it in four places in twenty minutes.

**Which chat a question belongs to.** `<aparte-elicitation>` could mount its panel in
ANOTHER chat's composer: it walked up looking for one and fell back to
`document.querySelector`. Removing that fallback was not enough — the walk itself
reached `<body>`, where a `querySelector` searches the whole document, so it found
the other chat's composer by a longer route. The walk now stops at the chat boundary
and finding nothing cancels with a warning that names the fix. A Stop in one chat also
cancelled the question another was waiting on, telling that chat's model the user had
refused something they were still reading — the two `window` listeners had no instance
filter at all. And in RAW core the composer could not identify itself either (all four
wrappers set `target`; hand-written markup does not), so one chat's Stop tore down the
other's open panel while its tool call kept waiting.

**What the model is asked to fill in.** A question with no options was schema-VALID:
`options` was neither required nor given a `minItems`, and the 2–6 range lived in the
system prompt as prose. A local model duly sent two questions with no options, and the
panel rendered a radio list whose only entry was "Other…" — a text box wearing the
costume of a choice. `options` is now required with `minItems: 2`, and a model that
ignores that gets an honest labelled text field instead of an empty `enum`. The
question text also stopped being the object property KEY: two identically-worded
questions used to collapse into one field, and the field was labelled only because the
panel falls back to printing the key. Stable keys now, the text as the field's `title`,
and a label map so the model still reads "question → answer".

**Who decides the UX.** `allow_other` is out of the model's schema and becomes
`setElicitationOptions({ allowOther })` on the config. The model describes the
question; the host owns the surface. Default `true`, so nothing a user sees changes —
only who gets to say so. A model still sending it is ignored, so no existing call
breaks. A field of a schema you build yourself can still set `allowOther`, and it wins.

**What the user sees.** The composer kept offering the attachment picker through an
entire elicitation — there is nowhere for a file to go while you are answering a
question. Declared now with `data-panel-active` + CSS instead of an inline
`style.display` that clobbered a consumer's own value. Groups of choices are named by
the question they answer (`role="radiogroup"`/`group` + `aria-labelledby`): a screen
reader used to announce "Chromium, radio button, 1 of 2" with no question attached.
Seven strings that were hardcoded English — "Other…", its placeholder and accessible
name, "Skip", "Yes", "No", "Your answer" — are optional locale keys with per-key
fallback, plus the French. And the panel's CSS moved out of a JS-injected `<style>`
into the stylesheet with fifteen `--aparte-elic-*` tokens: it was the one surface that
could not be themed, its variables were absent from the generated reference, and the
injection was never re-created if anything removed it.

**How several questions are asked.** A form of two or more questions put them all in
one box — a shape inherited from MCP elicitation without being examined. MCP describes
a form for collecting structured data; asking a person two different questions in the
middle of a conversation is not that, and no product does it by stacking. Several
questions are now asked ONE AT A TIME, with a chip per question that is also how you go
back. Each field takes a short  for that chip (the tool schema asks the model
for two or three words) and falls back to the question's position rather than
truncating a sentence. The protocol is untouched: the answer is still one object with
every key, and the composer's send button still means submit.  keeps
the form case, which is real — it was just never the right default.

**What a consumer can replace.** `setElicitationFieldRenderer` renders one field while
the panel keeps everything around it. It returns a control rather than
`string | HTMLElement` because a field must hand back a value, and the schema
vocabulary is now a stated contract — three field kinds plus the object form, closed,
with a test pinning the count so it cannot grow quietly.

**Migration.** `allow_other` is ignored rather than rejected. The panel's pixels can
move if you were overriding its rules by selector — that is the trade for being able to
override them by token. An `<aparte-elicitation>` mounted outside any chat now cancels
with a warning instead of borrowing the first composer on the page. `AparteLocale`
gains seven OPTIONAL keys, so an existing locale package keeps compiling and keeps
rendering English.

Twenty-six new unit tests and five browser tests — the first browser coverage this
surface has ever had. Every fix has its sabotage, and one of them refuted a claim of
mine before it shipped: the new axe scan does NOT catch an unnamed radio group, so the
comment saying it would is corrected in place and the unit tests are named as the real
guard.
