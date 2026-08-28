---
title: What a tool-call UI has to show
description: The five things a chat has to render for a tool call — the call, its arguments, its status, its result and the approval — why each one matters, and what aparté draws by default.
sidebar:
  order: 16
  label: Tool-call UI
---

A model that can call tools stops being a text box and starts being an agent, and the
transcript has to keep up: a reader must be able to tell *what the model did*, not only
what it said. This page is the checklist — the five things a tool call has to show, why
each exists, and what aparté renders for it out of the box. The how-to is in
[Tool calls with human approval](/guides/tools/); this is the why.

## 1. That a call happened, and to what

The minimum is a line in the flow of the answer: *the model called `get_weather`*. It
belongs **where it happened** — between the sentence before and the sentence after — not
in a side panel, because the order is the story: the model reasoned, called, read the
result, then wrote. A transcript that hides calls reads as if the model knew things it
had to look up.

aparté renders each call as a segment of the assistant's message, in sequence with its
text: one quiet row with the tool's name, so five calls are five quiet lines rather than a
wall of badges.

## 2. The arguments the model chose

The name says *which* tool; the arguments say *what the model decided*. `get_weather` with
`{ "city": "Lyon" }` is a different act from `{ "city": "Lyons, NY" }`, and the only place
a user can catch the difference is the arguments. They are also the first thing a
developer looks at when a tool misbehaves — a wrong argument is a prompt problem, a right
argument with a wrong result is a tool problem.

Every comparable kit shows them, behind a disclosure: the row stays quiet, and opening it
shows the input. aparté's row opens on the arguments as formatted, highlighted JSON.

## 3. The status, live

A call takes time. While it runs the reader needs to know the model is *waiting on
something*, not stuck; when it ends, how it ended. The transition is what a streaming
transcript is for: the row appears the moment the model emits the call, and changes in
place when the result lands.

aparté's row has five states — waiting for approval, running, completed, rejected by the
user, stopped — with a spinner while running and a glyph once settled. The change is
patched into the existing element, so a row a user has opened stays open across the
update. A tool that wants the model to see a failure returns it *as its result*, and the
row completes; a handler that throws ends the run instead, and surfaces as the message's
error card.

## 4. The result — and how much of it

The result is what the model read before it answered. Showing it lets the reader check
the answer against its source, and lets a developer see what the model was *given* when
the answer is wrong. It is also the one part that can be large — a file listing, an API
payload — so it belongs behind the same disclosure as the arguments, not inline.

There is a second kind of result: the one that *is* the answer. A tool that generates a
document, a chart, a form the user filled in — its result should be rendered as a thing,
not as JSON. That is what a **tool renderer** is for: a renderer registered for a tool
name replaces the default row with a surface of its own. aparté's
[`ask_user` plugin](/plugins/ask-user/) is the in-repo example — its result is drawn as a
receipt card of the question and the answer — and the built-in `create_artifact` tool is
the same shape: a call whose result is rendered richly. Register yours with
`registerToolRenderer` (see [Customization](/guides/customization/)).

## 5. The approval, before the fact

Some calls must not run without a human saying so: deleting, paying, sending. The UI has
to show the *proposed* call — name and arguments, since the arguments are what is being
approved — and offer accept or reject **before the handler runs**, with the run paused
meanwhile. Two things decide whether it is real: the gate has to be on the loop (a button
that is drawn but does not block the call is decoration), and the answer has to be
somewhere the user is already looking.

aparté puts the approval where the user's attention already is: the composer. The row in
the transcript says a call is waiting; the panel in the composer asks the question, and
the loop does not proceed until it is answered. The same panel serves the general case —
a tool that needs a choice, a yes/no or a small form from the user before it can finish
— which is [elicitation](/guides/elicitation/).

## What is deliberately not there (yet)

- **Grouping.** Some kits fold consecutive calls into one "3 tools used" line. aparté does
  not, on purpose: grouping spans segments, so it would touch the most load-bearing
  composition path in core for a presentational nicety — and a row that is one quiet line
  removes most of the noise grouping exists to tame. The trigger is a real transcript that
  becomes unreadable, measured on a page.
- **Timing and cost per call.** The engine reports usage per turn; per-call timing is a
  product's display decision, and the segment carries the timestamps a product needs.
- **A terminal, a file tree, test results.** These are tool *results* rendered richly,
  not message types — the same seam as point 4. The tool's name (`bash`, `run_tests`)
  belongs to the app, so the renderer does too.

## The checklist

| Show | Because | aparté, by default |
|---|---|---|
| The call, in place | The order is the story | A segment row in the message flow |
| The arguments | They are what the model decided | Disclosure, highlighted JSON |
| The status, live | Waiting is not stuck; the end is a state | Spinner → glyph, patched in place |
| The result | The reader checks the answer against its source | Same disclosure; or a tool renderer |
| The approval, first | A drawn button that does not block is decoration | Composer panel, loop paused |
