---
'@aparte/core': patch
---

The custom-elements manifest now describes every public method, and stops describing
three that do not exist.

`package.json` points `customElements` at `dist/custom-elements.json` and `files` ships
`dist`, so this file is not a docs-site input — it is what feeds editor autocomplete in
a consumer's project. Two defects were measured in it, and both reached everyone:

- **16 of 73 public methods carried no description at all** — the whole imperative
  surface of `<aparte-composer>` (`setValue`, `addAttachments`, `removeAttachment`,
  `clearAttachments`), all five public methods of `<aparte-composer-input>`, and
  `<aparte-chat-viewport>`'s `getMessages`. They are now documented; the count is zero.

- **Overloaded methods shipped their implementation signature as if it were API.** A
  TypeScript overload is N declarations plus one implementation, and the analyzer emitted
  all of them: `addSegment` appeared three times, the third being
  `addSegment(messageIdOrSegment: string | AparteSegment, maybeSegment?: AparteSegment)`
  — a form no consumer may call, since its only job is to accept the other two. A new
  analyzer plugin drops the implementation and copies the docblock (which TypeScript
  accepts only on the overload declarations) onto the sibling forms, so both real calling
  conventions are documented instead of one documented and one blank.

One behaviour is written down for the first time rather than changed: `getMessages()`
returns the messages on the **active path**, root → head — not the whole tree, which is
what `exportTree()` returns.

No runtime code changed by this entry.
