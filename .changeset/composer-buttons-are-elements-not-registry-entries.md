---
"@aparte/core": minor
---

Composer buttons are `<aparte-composer-action>` elements, not registry entries: `zones: ['composer']`, `composer.position` and `setActionHidden` are removed. If you registered an action with `zones: ['composer']`, write the element in your composer markup instead and listen for `aparte-action-click`; `zones: ['bubble']` is untouched. The `aparte-action` event detail's `zone` is typed `AparteActionZone` now, so a listener that narrows on `'composer'` no longer compiles.

The registry never placed a composer button. `getActions` was only ever called with `'bubble'`, by the message bubble; nothing in core asked it for the composer zone, so an action registered there rendered nowhere, `composer.position` decided nothing and `setActionHidden` toggled a flag no element read. `AparteActionZone` is now `'bubble'`, which is what the code always meant.

`composer.position: 'left' | 'right'` was also the one place left that named a side. Placement in the composer is the order you write the elements in, plus `margin-inline-start: auto` — a name a right-to-left locale contradicts is a name that will lie.

The customization guide now shows the composer button it used to mention in passing: the element, where it goes in the row, and the `action-id` that tells two of them apart.
