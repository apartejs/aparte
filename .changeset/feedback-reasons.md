---
'@aparte/core': minor
'@aparte/locales': minor
---

Add `setBubbleActions({ feedbackReasons: ['Not accurate', 'Too long'] })`: a thumbs-down then asks why.

One press sends the new `aparte-feedback-reason` event with the message id and the reason. `aparte-feedback` still goes out on the thumb itself, as before. New locale keys: `feedbackReasonTitle`, `feedbackReasonDismiss`.
