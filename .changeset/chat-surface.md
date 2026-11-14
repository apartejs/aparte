---
'@aparte/core': patch
---

`<aparte-chat>` lists, in the shipped custom-elements manifest and on its reference page, the 23 events a listener on it hears, each with its detail type.

Do you have to touch your code? No: nothing dispatches differently. The events reached the chat before; the manifest now says which, so an editor's tooltip and the element's page show them, and the wrapper bindings can be generated from them.

- **What is listed.** What the chat's parts send, bubbling — the composer's (`aparte-send`, `aparte-cancel`, `aparte-composer-change`, and `aparte-action-click` from a composer button the app wrote), the transcript's (`aparte-segment-update`, `aparte-path-changed`, `aparte-reset-done`), each message's (`aparte-action`, `aparte-retry`, `aparte-edit`, `aparte-feedback`, `aparte-feedback-reason`, `aparte-message-info`, `aparte-link-click`, `aparte-attachment-preview`) — and what the host that drives the chat sends on it: the turn (`aparte-message-start`, `-done`, `-error`, `-aborted`, `-paused`, `-resumed`, `aparte-tool-approval-request`) and `aparte-conversation-loaded`. Each description is written for a listener on the chat.
- **What is not, and why.** The page-wide events go out on `window` (`aparte-abort`, `aparte-compact`, `aparte-config-change`, …) and no listener on the chat hears them. Three reach the chat and stay off its list: `aparte-branch-navigate`, which the viewport stops and answers with `aparte-path-changed`; `aparte-composer-submit`, the bubble's inline editor's Enter, which the bubble turns into `aparte-edit`; and `aparte-tab-change`, a stepped elicitation moving between its questions.
- **Kept true.** The list is checked against the source in both directions: an event a part starts sending that the chat does not declare, or a declared one nothing sends, fails the build.
