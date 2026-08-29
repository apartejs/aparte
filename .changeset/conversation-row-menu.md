---
"@aparte/core": minor
---

`<aparte-conversation-list>` rows now carry one `⋯` button that opens a menu — rename, pin/unpin, archive/unarchive, delete with a confirmation — instead of permanent archive and delete icons; the rows are grouped by date (Pinned, Today, Yesterday, Previous 7 days, Previous 30 days, then by month) as soon as an item has `updatedAt`, and `no-groups` renders them flat. Three events are new: `aparte-rename-conversation` (`{ id, title }`), `aparte-pin-conversation` and `aparte-unpin-conversation` (`{ id }`); `AparteConversationListItem` gains `pinnedAt`; `AparteConversationManager` gains `pin(id)` and `unpin(id)`.

What changes for a host that styled or scripted the old row:

- The row is no longer a `role="button"` div with buttons inside it. It is a plain `.aparte-conv-item` wrapping two native buttons: `.aparte-conv-item__select` (the title, `aria-current` lives here now) and `.aparte-conv-item__more`. `[data-conv-id]` still marks the row.
- `.aparte-conv-item__archive` and `.aparte-conv-item__delete` are gone, and with them the tokens `--aparte-conv-delete-color`, `--aparte-conv-delete-bg-hover`, `--aparte-conv-delete-color-hover`, `--aparte-conv-delete-radius` and the `--aparte-conv-archive-*` fallbacks. `--aparte-conv-action-btn-size` now sizes the `⋯`.
- The locale strings `deleteConversation`, `archiveConversation` and `unarchiveConversation` are menu items now and default to the bare verb ("Delete", "Archive", "Unarchive"). New keys: `conversationActions`, `renameConversation`, `conversationTitle`, `pinConversation`, `unpinConversation`, `deleteConversationConfirm` (with `{title}`), `cancel`, and the five `conversationGroup*` headings. Month headings are formatted with the locale's `tag`.
- Three icon names join the provider: `more`, `pin`, `trash`. `trashIcon` and `moreHorizontalIcon` are still exported from `@aparte/core/icons`, as aliases of the same drawings.

Why the shape changed: two permanent icon buttons on every row — one of them turning red on hover — was the loudest element of the kit, and the first thing the maintainer named when asked what looked wrong. Every chat product on the market shows one quiet `⋯` on hover, a menu behind it, and asks before the one action it cannot undo. The old row was also two buttons nested inside a `role="button"`, which assistive technology does not model, with a synthetic Enter/Space handler to make the div act; two real buttons need none of that. The menu is placed with `position: fixed` and closes on any scroll, so the list's own overflow cannot clip it and no anchoring library is needed.
