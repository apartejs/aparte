---
'@aparte/core': minor
---

**An open request now follows a language switch.** `AparteElicitationRequest.message` and `AparteApprovalOption.label` accept `string | (() => string)`; the function arm is re-read whenever the locale changes while the request is on screen.

Additive — a string still behaves exactly as before, and deliberately so: a plain string is treated as the host's own wording and left alone. That is right for an app's text and wrong for locale-derived text, which is why core's own approval gate now passes functions.

The gate was asking `Run delete_file?` over buttons reading `Approuver` and `Rejeter`. `approveTool` and `rejectTool` have been translated in `@aparte/locale-fr` since long before this: nothing was missing from the translations, the re-read path was missing. It existed while the buttons lived in the segment, and moving them to the composer left it behind.

The tool's NAME is substituted into the question and never translated — it is the identifier the model called, wire format, so only the frame switches.
