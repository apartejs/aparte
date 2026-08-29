---
"@aparte/plugin-artifacts": minor
"@aparte/plugin-ask-user": minor
---

`buildSafePreviewDocument`, `PREVIEW_CSP`, `ASK_USER_DECLINED` and `receiptRows` now import on the server too — they used to throw a SyntaxError under Node.

All four are pure: string work over `escapeHtml`/`escapeAttr` and over a tool call's own input, with no DOM anywhere in their path. They were simply absent from the packages' `node` barrels, and the consequence was not a missing feature but a hard `SyntaxError: The requested module does not provide an export named …` the moment an SSR build evaluated the import — the exact failure those barrels were written to end. `buildReceipt` stays browser-only: it returns an element. `receiptRows` is the data half, and it is the one a server rendering a transcript wants.

`ReceiptRow` and `ReceiptSource` are exported as types on both entries. `receiptRows` returned an interface no consumer could name.

`ArtifactsSetupOptions` is now declared once. Each barrel declared its own, and they were not the same shape: the node copy omitted the render half, so `preview` and `onBinary` were a type error against the SSR entry and valid against the browser one. One name meant two contracts depending on which condition resolved. The server still ignores those two fields — it registers no renderer — which is the point: the same options object can be written once and passed on both sides.
