---
"@aparte/core": minor
---

The kit has a dialog: `.aparte-dialog` styles the browser's own `<dialog>` — `__header`, `__title`, `__close`, `__body` (the region that scrolls), `__footer`, the `::backdrop`, `--sm` / `--lg` widths, a full-screen sheet under 30rem — and three attributes wire it with no script: `data-aparte-dialog-open="id"` on any control calls `showModal()` on the dialog it names, `data-aparte-dialog-close` inside one closes it (its value becomes the dialog's `returnValue`), and a click on the backdrop closes it unless the dialog carries `data-aparte-dialog-static`. `installDialogTriggersOnce()` is exported for a host that builds its page before importing core.

Issue #32, item 1. The kit used to say a modal was "deliberately absent — it needs a portal and a stack manager"; the browser has had both since 2022 in `<dialog>` + `showModal()` (top layer, focus trap, Escape, focus return), so the recipe styles that element and nothing wraps your content — a custom element that moved children into an inner `<dialog>` would have broken every framework that renders them.
