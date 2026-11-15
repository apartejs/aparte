---
'@aparte/core': minor
'@aparte/plugin-cards': minor
'@aparte/plugin-approval': minor
'@aparte/plugin-diff': minor
'@aparte/plugin-artifacts': minor
'@aparte/plugin-model-selector': minor
'@aparte/plugin-triggers': minor
---

Events sent from inside a chat now carry `targetId`, the id of that chat — `aparte-card-action`, `aparte-card-change`, `aparte-approval-mode-change`, `aparte-diff-comment` and the others — so a page with several chats can tell them apart. New: `chatIdOf(el)` and `dispatchChatEvent(el, type, detail)`.

What carries it now: a message's `aparte-action`, `aparte-feedback`, `aparte-feedback-reason`, `aparte-message-info`, `aparte-branch-navigate`, `aparte-link-click` and `aparte-attachment-preview`; the composer's `aparte-composer-change`, `aparte-action-click` and `aparte-attachment-preview`; the viewport's `aparte-path-changed` and `aparte-segment-update`; `aparte-suggestion`; `aparte-model-change`; `aparte-approval-mode-change`; `aparte-trigger-select`; `aparte-card-action` and `aparte-card-change`; `aparte-diff-comment`; `aparte-artifact-open` and `aparte-artifact-version-change`. Their detail types gain `targetId?: string`; nothing is removed. A chat with no `id` names none, and the detail then has no `targetId` key.

`chatIdOf(el)` is the rule core uses everywhere it needs an element's chat, exported: the `target` of the nearest aparté element that names one, else the id of the nearest `<aparte-chat>` or `[data-aparte-chat]` root that has one, across a shadow root. It replaces the copies the composer, the client, the bubble, the context gauge, the suggestions and the triggers each kept. `dispatchChatEvent(el, type, detail, { cancelable })` dispatches a bubbling, composed event with that `targetId` stamped on the detail (one the detail already has is kept) and returns what `dispatchEvent` returns: a plugin's element, or yours, sends its events the way core's do.

The plugins that use them need `@aparte/core` 1.10.0.
