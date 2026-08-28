---
"@aparte/plugin-artifacts": minor
---

New package: `setupArtifacts()` registers a real `create_artifact` tool the model calls, the Code/Preview card that renders its result, the `<artifact …>…</artifact>` grammar for a model that writes one in its prose, and the segment renderer for it — one implementation, four registrations.

An artifact is a convention an app teaches its model, not something a model does by nature, so the convention lives in a plugin end to end. The card is the one core used to ship: it opens on Code, mounts the sandboxed preview only on a press (a previewable artifact is model-authored code), copies and downloads a text artifact, and for a binary one (`pdf`, `xlsx`, `docx`) asks the app's `onBinary(artifact)` for the bytes once the source settles — no window-event protocol, no host handlers, no cache the app has to feed: a function that returns `{ buffer, mime, filename, previewHtml? }` or throws, and the card shows the file or the failure. `preview: false` removes the tab; a function replaces the built-in document builder; `tag` renames or (`false`) disables the grammar; `name` and `systemPrompt` are the tool's. `deriveArtifactKind` moves here and learns the standard names of the three binary kinds. The DOM-free `node` entry registers the tool and the grammar without a renderer.
