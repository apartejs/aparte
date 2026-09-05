---
title: Stability — what freezes at the beta
description: The surface the beta will freeze — elements, events, exports, tokens — and the rule a change must follow once it is frozen.
sidebar:
  order: 9
  label: Stability
---

Every `@aparte/*` package is a `0.x`, and the [roadmap](/roadmap/) names the beta as the moment a declared surface stops moving without notice. This page is that declaration, written before the beta so that you can read what *will* freeze; on the day, the wording changes from *will* to *is* and nothing else. Until then the alpha rule holds: a rename lands as a rename, without an alias, and the changeset says so.

Everything below is measured on the tree, not typed: the element list is the custom-elements manifest, the events are the typed event map, the exports are the barrel. The figures on the [roadmap](/roadmap/) are counted the same way.

## The promise

From the beta on, a **frozen** element, event, export or token does not change meaning, name or shape in one release. A change goes through two:

1. **A notice release.** The old name still works and is marked deprecated, with the release it disappears in and the replacement, in the changelog and in the JSDoc.
2. **A removal release**, at least one minor later.

What is *not* listed here stays free to move, and that is the point of a list: a default colour, a spacing, an English label, the content of a docs page, the example apps, `@aparte/docs-mcp` (a tool, not an API), and anything whose JSDoc says `@experimental`.

Adding is always allowed: a new optional attribute, a new optional field on an event's `detail`, a new export. Removing or renaming is what the two-release rule governs.

## The elements

The tag name, the attributes and properties the manifest documents, and the `@cssprop` tokens each one reads. Twenty-four in `@aparte/core`:

`aparte-chat`, `aparte-chat-bubble`, `aparte-chat-status`, `aparte-chat-viewport`, `aparte-composer`, `aparte-composer-action`, `aparte-composer-add-attachment`, `aparte-composer-attachments`, `aparte-composer-cancel`, `aparte-composer-input`, `aparte-composer-send`, `aparte-composer-toolbar`, `aparte-context`, `aparte-conversation-list`, `aparte-elicitation`, `aparte-icon`, `aparte-optgroup`, `aparte-option`, `aparte-progress-spinner`, `aparte-scroll-rail`, `aparte-select`, `aparte-sidebar`, `aparte-split`, `aparte-suggestions`.

And three in plugins: `aparte-ask-user` (`@aparte/plugin-ask-user`), `aparte-approval-mode` (`@aparte/plugin-approval`), `aparte-model-selector` (`@aparte/plugin-model-selector`).

The [components reference](/components/) is generated from the same manifest, page by page.

## The events

Forty typed events, all kebab-case and prefixed `aparte-`. Frozen: the name, and the shape of `detail` (a field may be added if optional; none is removed or renamed).

`aparte-send`, `aparte-retry`, `aparte-edit`, `aparte-action`, `aparte-path-changed`, `aparte-branch-navigate`, `aparte-link-click`, `aparte-feedback`, `aparte-message-info`, `aparte-message-done`, `aparte-model-change`, `aparte-approval-mode-change`, `aparte-tool-approval-request`, `aparte-composer-change`, `aparte-select-change`, `aparte-segment-update`, `aparte-conversation-select`, `aparte-conversation-delete`, `aparte-conversation-archive`, `aparte-conversation-unarchive`, `aparte-conversation-rename`, `aparte-conversation-pin`, `aparte-conversation-unpin`, `aparte-message-start`, `aparte-message-error`, `aparte-message-aborted`, `aparte-abort`, `aparte-compact`, `aparte-compact-start`, `aparte-compact-done`, `aparte-compact-error`, `aparte-attachment-preview`, `aparte-action-click`, `aparte-suggestion`, `aparte-context-threshold`, `aparte-scroll-rail-jump`, `aparte-sidebar-toggle`, `aparte-split-resize`, `aparte-optgroup-toggle`, `aparte-config-change`.

The [events reference](/reference/events/) carries each one's `detail` type and the element that fires it. The wrapper bindings (`onConversationSelect` in React, `(conversationSelect)` in Angular, and so on) follow from these names and freeze with them.

## The exports

The values `@aparte/core` exports from its barrel — eighty-six today, from `AparteClient` and `AparteConversationManager` to `registerSegmentRenderer` and `registerDefaultRenderers` — and the types their signatures name. Each package's README and the reference pages list them; the gate refuses a public export that no page mentions.

Each plugin and provider freezes the same way: its `setup*` entry, the options that entry takes, and the types it exports. `@aparte/engine` freezes `runStreamAgent`, its options and the stream event vocabulary.

## The tokens

Every `--aparte-*` custom property the [CSS variables reference](/reference/css-variables/) documents, by name and by what it controls. Its default *value* is not frozen: a palette can be retuned in a minor.

CSS classes are not frozen. They all carry the `aparte-` prefix, and that prefix is the promise: nothing core emits will collide with a class of yours. Style them if you like, but a class is a rendering detail, and a rename there is a patch.

## What still moves before the beta

The `next` branch carries the last renames that land *before* the freeze, each with a changeset that names the old and the new: the conversation list's seven events, now subject-first (`aparte-conversation-select`, not `aparte-select-conversation`), and its `flat` attribute, which was `no-groups`. Both are already in the lists above.
