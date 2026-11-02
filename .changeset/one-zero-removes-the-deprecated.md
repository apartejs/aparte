---
'@aparte/core': major
'@aparte/locales': major
---

Everything marked deprecated is removed. If your code uses none of the names below, nothing changes; otherwise replace each one as its line says.

- `<aparte-context auto-compact>`, deprecated in 0.26.0: remove the attribute. The gauge no longer asks for a compaction; `@aparte/plugin-compaction` compacts by itself once it is set up (past 80 % of the window by default).
- The `compactionSummaryTitle` locale key, deprecated in 0.26.0: remove it from your locale. Nothing has read it since 0.26.0, and the nine locales of `@aparte/locales` no longer carry it.
- The `window` field of an `aparte-compact` request's detail, read "for one more release" since 0.26.0: give `setupCompaction` a `contextWindow` instead, or let the model declare its window.
- The viewport's `clearMessages()`, deprecated since 0.4.0: call `clearAll()`, which also removes the bubbles. `clearMessages()` on `<aparte-chat>`, on the framework components and on the imperative API is unchanged.
- `AparteMessageBranch` and the `branches` / `activeBranchIndex` fields of `AparteMessage`, deprecated since 0.4.0 and read by nothing: branches are the message tree (`addSiblingOf`, `navigateBranch`, `aparte-path-changed`).
- `AparteCodeSegment.showLineNumbers` and `AparteErrorSegment.stack`, deprecated in 0.19.3 and read by nothing: put a stack in `details`.
