---
"@aparte/core": minor
---

The approval panel now shows the tool call's arguments under the question — the thing being approved is on the surface where you click.

New `details?: string` on `AparteElicitationRequest`, and a fourth (optional) argument on `buildApprovalPanel`. Set it on your own `requestUserInput({ kind: 'approval' })` and the text appears between the question and the options, in a capped, scrollable, keyboard-reachable block. It is rendered through `textContent` — never markup, and never a render hook: the content is model-authored, on the one control in the library whose whole job is to stop a model.

The built-in gate fills it with the call's pretty-printed JSON. Until now the panel asked *Run `delete_file`?* and stopped there, while which file — the whole of what a person is deciding — stayed in the transcript row behind a disclosure that stays closed on purpose. The guide had promised the opposite the entire time ("name and arguments, since the arguments are what is being approved"), and so had the client's own docblock, which said the arguments stay in the transcript. Both now describe what happens.

One function builds the text for both surfaces (`describeToolInput`, in `utils/`), because two renderings of one value drift — and here the drift would be a person approving a call they read differently from the one that runs. The transcript row still does not open itself: the panel is the decision surface now, so the last argument for unrolling it is gone. New locale key `approvalArgsLabel` (default "Arguments"), translated in `@aparte/locale-fr`.
