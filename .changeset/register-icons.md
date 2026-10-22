---
'@aparte/core': minor
---

New `registerIcons({ name: () => markup })` adds icons to the set without replacing it, and a name core does not draw now works everywhere an icon name does: an action's `icon`, `<aparte-composer-action icon>`, `<aparte-icon name>`.

`setIconProvider` replaces the whole set, so a plugin's icons and the app's could not both be registered; and the provider the components read listed core's names only, so `registerAction({ icon: 'share' })` drew nothing even when the app's provider had a `share`. `getIcon(name)` is typed by overload: a known name returns a `string`, any other a `string | undefined`. Merge a name into `AparteIconProvider` (`declare module '@aparte/core'`) to type it as known; the Icons guide shows it.
