---
"@aparte/core": minor
---

Read an error segment's machine code from `code`: it is no longer in `details`, and the alert no longer prints it.

A failed turn carried its `AparteErrorCode` in `details`, which the alert draws, so the person read `UNKNOWN_ERROR` or `MAX_TURNS_EXCEEDED` under a sentence that already said what happened. The code is the segment's `code` now, stamped on the alert as `data-error-code` and handed to a custom error renderer (`setErrorRenderer` receives `code`). `details` stays for text an app chooses to show.
