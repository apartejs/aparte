# @aparte/plugin-diff

## 1.13.1

## 1.13.0

## 1.12.2

## 1.12.1

### Patch Changes

- 1da0eee: `<aparte-diff>` no longer draws its rows again when handed the same comments or the same change; nothing to change in your code.

  A framework hands `comments` and `diff` on every render, often as a new array of the same comments (`review.filter((c) => c.path === file)`) or a new `{ path, before, after }` with the same texts. Each drew every row again: what the reader was doing was carried over, but every row was a new element, so a text selection in the code was lost and the field being written in left the page and came back. A list of the same comments, or a change with the same texts, now draws nothing. A comment changed in place and handed back is still drawn, and an app's own fields on a comment (`id`, say) do not count, since the view does not show them (#253).

## 1.12.0

## 1.11.0

### Patch Changes

- 77f1d8e: A diff line's two numbers are set further apart, so a line far down a file (`118 118`) no longer reads as one number. Nothing to change in your code.

  Each number now keeps `--aparte-space-5` on both sides instead of `--aparte-space-2`: 20px between the old number and the new one with the default spacing, where it was 8px, about one character once a number filled the column's three-digit minimum. 20px is what a unified diff leaves between them (GitHub and GitLab). The gutter's selectors are documented under Customize, for an app that wants a rule between the two columns.

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

- 100a185: An approval question can now show what the call would do: a tool's display takes `approvalPreview`, and the panel mounts what it returns between the question and the buttons.

  `approvalPreview(call)` returns an element, a string of HTML (sanitised) or `null`; `requestUserInput()` takes the same thing as `preview` on an approval request. `setupDiff()` registers a diff preview for an edit tool from its input (`before` and `after`, or `old_string` and `new_string`), and takes a `preview` option for another shape, or `false` for none.

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

### Minor Changes

- 84ef498: New `@aparte/plugin-diff`: show a file change as hunks with line numbers, in the reply or beside it, and let the reader comment on a line.

  ```ts
  import { setupDiff } from "@aparte/plugin-diff";

  // An edit tool's result, as a diff under its line in the reply.
  setupDiff({
    tool: "edit_file",
    map: (result, input) => ({
      path: String(input.path),
      before: result.before,
      after: result.after,
    }),
  });

  // Beside the chat, open to comments.
  const view = document.querySelector("aparte-diff")!;
  view.commentable = true;
  view.diff = unifiedDiffText; // or { path, before, after }, or a list of files
  view.addEventListener("aparte-diff-comment", (e) => keep(e.detail)); // { path, side, startLine, endLine, text, code }
  view.comments = kept; // shown under their lines, pending or sent
  ```

  - **`<aparte-diff>`** shows each file under a header with its path, what happened to it (added, deleted, renamed) and its counts, which folds it; each line with its old and new numbers and a `+` or `−`, said as "added" and "removed" to a screen reader; the unchanged runs between hunks folded, with a "Show N unchanged lines" button when the whole text is known. The lines are coloured by the chat's highlighter when one is installed, in the language of the path's extension, and the code reads left to right in a right-to-left page.
  - **Comments**, with `commentable`: a click on a line number opens a field of the kit under the line, Shift+click stretches the selection; from the keyboard the numbers are one tab stop, the arrows move, Shift+arrows stretch, Enter or Space opens the field, Escape lets go. Sending fires `aparte-diff-comment` (bubbling, cancelable). The element keeps nothing: the comments the app hands back through `comments` are shown under their lines with their state. Without `commentable`, nothing is clickable.
  - **`setupDiff({ tool, map, commentable, open }, config?)`** puts the change behind an edit tool's line, opened, and keeps the row's label, summary and states. Each row has its own diff, kept through the call's updates and gone with the row. It returns the function that takes it off.
  - **`diffTexts`, `parseUnifiedDiff`, `formatUnifiedDiff`** compute, read and write diffs with no DOM, from the server entry too. The line diff is Myers' algorithm, written in the package: no dependency; a large file is first cut at the lines it holds once on each side (patience anchoring), so 200,000 lines changed in a thousand places still give a thousand small hunks in well under a second. A side given as `null` is a file created or deleted, `''` an empty file. What `formatUnifiedDiff` writes, `git apply` takes (`new file mode`, `deleted file mode`, `rename from` / `rename to`); `parseUnifiedDiff` reads a rename only where git says one, so `diff -u x.c.orig x.c` is a change to `x.c`.
  - Tints are tokens that fall back to core's (`--aparte-diff-added-bg` on `--aparte-success-surface`, `--aparte-diff-removed-bg` on `--aparte-error-surface`, and the inks); the words are in the ten languages `@aparte/locales` ships.
