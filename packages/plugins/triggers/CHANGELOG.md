# @aparte/plugin-triggers

## 1.16.0

## 1.15.1

## 1.15.0

## 1.14.0

### Minor Changes

- 749770c: A `/` command and a trigger row can show a badge at the end of the row: `badge: 'Beta'`. It stays while the person filters the list.

  Nothing to change in your code. `AparteCommand.badge` and `AparteTriggerItem.badge` take a short text, drawn as the kit's small badge (`.aparte-menu__badge`) before a submenu's chevron, as text. A command's `group` heading says a state only while nothing is searched, because a filtered list is ranked rather than grouped; the badge is on the row itself. `commands.override` changes it like any other field. A row drawn by your own `render` draws its own badge.

## 1.13.1

## 1.13.0

### Patch Changes

- 205d5a9: `/retry` now targets the AI's last answer, never a notice or a person's message after it.

  When a notice or a person's message follows that answer, regenerating it would drop what came after, and the chat refuses, as its own Regenerate button does.

## 1.12.2

## 1.12.1

## 1.12.0

## 1.11.0

## 1.10.1

## 1.10.0

### Minor Changes

- 5f96251: A plugin's element can now be used from React as a typed component: `createAparteElement(approvalModeElement)` from `@aparte/react`. Each plugin exports a spec for its element (`approvalModeElement`, `modelSelectorElement`, `triggersElement`, `diffElement`, `subagentViewElement`, `askUserElement`, and `artifactPanelElement` from `@aparte/plugin-artifacts/panel`), and Vue and Svelte type the tag from it with `AparteVueElement<typeof spec>` and `AparteSvelteElement<typeof spec>`.

  ```tsx
  const ApprovalMode = createAparteElement(approvalModeElement);
  <ApprovalMode
    labels={{ ask: "Ask first" }}
    onApprovalModeChange={(detail) => save(detail.mode)}
  />;
  ```

  The spec is core's new `AparteElementSpec` type — the tag, its attributes, the members it has only as a property, its events with the name each binds under, and what it reads at connect — with phantom generics, so the attribute, property and event types travel with the value (`AparteSpecAttributes`, `AparteSpecProperties`, `AparteSpecEvents` read them back). It is data and defines nothing. A plugin generates its specs from its manifest; a third party writes one literal and every wrapper binds it the same way, since a plugin can depend on core but never on a wrapper. In Angular, a plugin's element takes `CUSTOM_ELEMENTS_SCHEMA`, as any custom element does.

  Deprecated: `@aparte/plugin-model-selector/react`, `/vue`, `/svelte` and `/angular`. They keep working until the next major; use `modelSelectorElement` the same way as any other plugin's spec.

- b4ff550: Events sent from inside a chat now carry `targetId`, the id of that chat — `aparte-card-action`, `aparte-card-change`, `aparte-approval-mode-change`, `aparte-diff-comment` and the others — so a page with several chats can tell them apart. New: `chatIdOf(el)` and `dispatchChatEvent(el, type, detail)`.

  What carries it now: a message's `aparte-action`, `aparte-feedback`, `aparte-feedback-reason`, `aparte-message-info`, `aparte-branch-navigate`, `aparte-link-click` and `aparte-attachment-preview`; the composer's `aparte-composer-change`, `aparte-action-click` and `aparte-attachment-preview`; the viewport's `aparte-path-changed` and `aparte-segment-update`; `aparte-suggestion`; `aparte-model-change`; `aparte-approval-mode-change`; `aparte-trigger-select`; `aparte-card-action` and `aparte-card-change`; `aparte-diff-comment`; `aparte-artifact-open` and `aparte-artifact-version-change`. Their detail types gain `targetId?: string`; nothing is removed. A chat with no `id` names none, and the detail then has no `targetId` key.

  `chatIdOf(el)` is the rule core uses everywhere it needs an element's chat, exported: the `target` of the nearest aparté element that names one, else the id of the nearest `<aparte-chat>` or `[data-aparte-chat]` root that has one, across a shadow root. It replaces the copies the composer, the client, the bubble, the context gauge, the suggestions and the triggers each kept. `dispatchChatEvent(el, type, detail, { cancelable })` dispatches a bubbling, composed event with that `targetId` stamped on the detail (one the detail already has is kept) and returns what `dispatchEvent` returns: a plugin's element, or yours, sends its events the way core's do.

  The plugins that use them need `@aparte/core` 1.10.0.

### Patch Changes

- 81d38ee: An element handed a value it already holds no longer closes, unfocuses or resets what the person was doing in it — re-rendering a framework wrapper with the same props is now harmless.

  - `<aparte-triggers>`: re-setting `triggers` keeps the open list open, on the row the keyboard was on, when the trigger it shows is still declared at the same place; a child list opened from a row stays open, on its own row, while that row is still listed, and closes with it otherwise. The commands-and-mentions recipe re-set it on every React render, so the list opened on `@` and closed at once.
  - `<aparte-approval-mode>`: re-setting `labels` renames the options in place, so an open list stays open.
  - `<aparte-diff>`: re-setting `diff` with the change it shows — the same text or object, or an equal one, such as an inline `{ path, before, after }` — keeps the lines picked, the comment field and its text, the folds and the focus. The same object mutated into another change is drawn and coloured from its new text, and keeps the folds and the lines picked that still exist in it.
  - `<aparte-artifact-panel>`: re-setting `render` with the same function keeps the tab and the preview the reader chose.
  - `<aparte-conversation-list>`: re-setting `conversations` while a row's menu is open or a title is being renamed waits for them to end, instead of closing the menu and dropping what was typed.
  - `<aparte-suggestions>`: re-setting `suggestions` keeps the focused chip and the row's scroll.
  - An attribute written again with the value it has does nothing, on every element of core and the plugins (eleven of them redrew or rewrote their parts).

  `applyElementProps`, which every `AparteUi` and the generated React components use, now writes an attribute or a CSS variable only when it differs from the value it last wrote on that element; an object or a function is still assigned every time, because it may have been mutated in place (a Vue `push` behind a deep watch, a Svelte 5 proxy, Svelte 4's `arr = arr`). An element that changes its own attribute keeps what it did until the prop next changes, as the React components already behaved.

  A test reads every element of core and of the seven plugins with a manifest and holds each to this: an attribute written again makes no mutation under the element, and a property assigned again keeps the focus and what is open, selected or typed.

## 1.9.0

## 1.8.0

## 1.7.0

## 1.6.0

## 1.5.0

## 1.4.0

## 1.3.0

## 1.2.0

## 1.1.2

## 1.1.1

## 1.1.0

### Minor Changes

- 855778c: New package: `/` commands, `@` mentions and any other trigger character in the composer.

  Write `<aparte-triggers>` inside `<aparte-composer>` and give it the triggers you want: static lists or a search function with `AbortSignal`, groups, submenus of any depth, your own row rendering. A row runs something, inserts text, or inserts a pill that sends a text of its own. The focus stays in the field; arrows, Enter, Tab and Escape act on the menu, in right to left too, and a phone gets one panel at a time.

  `@aparte/plugin-triggers/commands` adds `/new`, `/stop`, `/retry` and `/copy` when you ask for them.
