---
'@aparte/core': minor
---

New `registerIcons({ name: () => markup })` adds icons to the set without replacing it, and a name core does not draw now works everywhere an icon name does: an action's `icon`, `<aparte-composer-action icon>`, `<aparte-icon name>`.

TypeScript: if you merged an icon name into `AparteIconProvider`, `getIcon` on that name now returns `string | undefined` instead of `string` — add `?? ''` (or `!`) where you need a string.

`setIconProvider` replaces the whole set, so a plugin's icons and the app's could not both be registered; and the provider the components read listed core's names only, so `registerAction({ icon: 'share' })` drew nothing even when the app's provider had a `share`. `getIcon(name)` is typed by overload: one of core's names returns a `string`, any other a `string | undefined` — a name merged into `AparteIconProvider` (`declare module '@aparte/core'`) included, since only the configurations it was registered on draw it. The merge makes the name one `setIconProvider` takes and `AparteIconName` lists; the Icons guide shows it. `getIconProvider()` keeps core's names required and a merged one optional (new `AparteCoreIconName` type), and a name is looked up among the set's own keys, so `icon="constructor"` draws nothing instead of a function.
