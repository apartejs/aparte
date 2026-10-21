---
'@aparte/core': patch
---

`AparteCodeSegment.showLineNumbers` and `AparteErrorSegment.stack` are deprecated: nothing reads them, and they will be removed in a later minor.

No renderer or stylesheet draws line numbers, and the error renderer draws `content` and `details` only, so setting either field changed nothing. Put a stack trace in `details` to show it. Code that sets them keeps compiling until the removal, which a later changeset will announce.
