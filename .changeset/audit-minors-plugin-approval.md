---
"@aparte/plugin-approval": minor
---

The `node` entry exports the `AparteApprovalMode` element type, so an SSR consumer on `node16`/`nodenext` can name it in a signature.

`export type` is erased at compile time, so the entry stays DOM-free — `scripts/check-node-import.mjs` asserts it keeps importing without a document. The element itself is deliberately absent from that entry: it needs a `document`, and `import '@aparte/plugin-approval'` on a server registers the policy and nothing else.
