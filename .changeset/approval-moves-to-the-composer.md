---
'@aparte/core': minor
'@aparte/engine': minor
'@aparte/locale-fr': patch
---

**The tool-approval decision moves out of the transcript and into the composer.**

A request that blocks the run is answered where the user answers. That is now a rule for the library, not a choice made once: the composer is where a question already went, and the approval gate was the only decision surface left in a bubble. It was older than the mechanism that should have carried it — built with a segment renderer and a `document` event because neither `showPanel` nor a typed presenter existed yet — and nothing came back for it, partly because for a stretch the whole human-in-the-loop path was inert and so nothing exercised it.

**What you see.** The `tool_call` pill stays in the transcript as the **anchor**, saying which tool is waiting, with no role, no tab stop and nothing clickable. The choices appear in the composer, each settling on the first click, above a quiet field for saying what to do instead. The thing being judged stays in the thread, which is scrollable, copyable and persisted; the panel is capped at half the viewport and could not hold a diff or a plan.

**Breaking, pre-1.0, no shims:**

- **`aparte-tool-decision` is deleted** — the event, `AparteToolDecisionDetail`, its event-map entry and the `document` listener that answered it. It existed only because a segment renderer has no reference to the client. To answer programmatically, pass an `approvalResolver` or register your own presenter; both see the whole request instead of an id on an event.
- **`AparteToolApprovalResolver` and `StreamApprovalResolver` take the CALL**, `(call, signal)` rather than `(toolCallId, signal)`. You cannot ask a person "run this?" without naming what — and an id alone forced a lookup table filled by one event and read by another, the shape that breaks in silence.
- Both resolvers may return an **`instruction`**, the words the model reads back on a refusal.
- **`AparteElicitationRequest` gains `kind` and `options`**, and `schema` is now optional — required on a `'question'`, absent on an `'approval'`.

**New:** `buildApprovalPanel` and `BuiltApprovalPanel`, `AparteApprovalOption` and `AparteApprovalAnswer`, and four locale keys (`approvalAsk`, `approvalWaiting`, `approvalInstructionPlaceholder`, `approvalOptionsLabel`), translated in `@aparte/locale-fr`.

**`<aparte-chat>` now ships `<aparte-elicitation>` in its default composition.** The built-in gate asks through the presenter, so a chat without one could not honour `needsApproval` at all. An affordance core honours end to end is on by default; leaving this out would have made the gate depend on a tag nobody was told to write. Author-provided compositions are untouched, as always.

**The options come with the request.** Core supplies two — the tool's name as the question, Approve and Reject — and anything richer is the host's: a scope option ("and always for this tool") exists only because an app wrote the label and can remember the grant. Core never invents one and never interprets one.

**Also fixed, in passing:** a panel's own buttons inherited the composer row's 44×44 action-control sizing and rendered as circles with their labels spilling out. Any panel containing a button hit this; the approval options were the first that do.
