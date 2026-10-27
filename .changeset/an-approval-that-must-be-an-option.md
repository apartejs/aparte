---
"@aparte/core": patch
---

An approval can now require one of its options: pass `freeText: false` to `requestUserInput` and the "Or tell it what to do instead" field is left out.

The corner still declines, since an unanswered approval is never a yes. The default is unchanged: the field is there unless a request says otherwise.
