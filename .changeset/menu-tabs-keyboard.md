---
'@aparte/core': minor
'@aparte/plugin-artifacts': patch
---

Menus and tabs drawn with the kit can now be driven from the keyboard: `enhanceMenu`, `enhanceContextMenu` and `enhanceTabs`.

```ts
import { enhanceMenu, enhanceContextMenu, enhanceTabs } from '@aparte/core';

const releaseMenu = enhanceMenu(button, menu, { align: 'end' });
menu.addEventListener('aparte-menu-select', (e) => run(e.detail.item.dataset.action));

const releaseRowMenu = enhanceContextMenu(list, rowMenu, {
  onOpen: (target) => (target.closest('[data-id]') ? undefined : false),
});

const releaseTabs = enhanceTabs(tablist);
tablist.addEventListener('aparte-tab-change', (e) => console.log(e.detail.tab, e.detail.panel));
```

Each takes the kit's existing markup (`.aparte-menu` with `role="menuitem"` items, `.aparte-tabs` with `role="tab"` and `aria-controls`) and returns a function that stops it. Nothing changes for markup drawn without them.

- **`enhanceMenu(trigger, menu, options?)`** — the WAI-ARIA menu button. The button opens the menu on a click, Enter, Space, ArrowDown (first item) or ArrowUp (last item); inside, the arrows wrap, Home and End jump, a letter goes to the next item that starts with it, and disabled, `aria-disabled` or hidden items are skipped. Escape closes it and puts the focus back on the button; Tab closes it and moves on from the button; a press outside, the focus leaving or a resize close it, and so does a scroll that moves the button (the page, a list it is in) but not one beside it, such as a reply streaming in. A click on the button of an open menu closes it, WebKit included. One menu is open at a time. The menu is shown with `hidden` and placed fixed under the button with `placeFloating` (options: `align`, `side`, `gap`, `margin`, `rtl`). `onOpen` fills it as it opens (return `false` to keep it shut), `onClose` runs after.
- **`enhanceContextMenu(region, menu, options?)`** — the same menu, opened by a right click (at the pointer), Shift+F10 or the Menu key (under the focused element) anywhere in `region`. `onOpen(target)` says which element it was asked about; return `false` to leave the browser its own menu. Escape puts the focus back where it was.
- **`aparte-menu-select`** fires on the menu with `{ item }` when an item is chosen, before it closes; `preventDefault()` keeps it open. A `menuitemcheckbox` or `menuitemradio` is not ticked for you: set `aria-checked` in the listener.
- **`enhanceTabs(tablist, options?)`** — the WAI-ARIA tabs. One tab stop, ArrowRight / ArrowLeft (the other way round in right-to-left) or ArrowDown / ArrowUp with `aria-orientation="vertical"`, Home and End, disabled and hidden tabs skipped; `aria-selected` kept, the panel named by `aria-controls` shown and the others `hidden`. `activation: 'manual'` lets the arrows move the focus only. **`aparte-tab-change`** fires on the tablist before a tab is selected, with `{ tab, panel, previous }`; `preventDefault()` keeps the current one. Select from code with `tab.click()`.
- All three touch no DOM until called, so they are exported from the server entry too.

The conversation list's row menu now runs on them: it gains type-ahead, and a right click, Shift+F10 or the Menu key on a row opens the same menu there. Tab in the menu now moves on from the `⋯` button instead of stopping on it. The elicitation panel's stepped questions and `@aparte/plugin-artifacts`' card tabs run on `enhanceTabs` too; the card's panes also carry `hidden` when they are not shown.
