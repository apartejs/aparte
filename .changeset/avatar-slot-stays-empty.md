---
'@aparte/core': patch
---

**Fix: any config change made avatars appear across the transcript, and switching back did not remove them.**

The default bubble shell renders `<div class="aparte-avatar">` empty, and the
stylesheet hides it while it stays that way — `.aparte-avatar:empty { display: none }`,
with the comment "No message avatar by default — the slot only shows once an
AvatarProvider (or a consumer) fills it."

`_updateName()` wrote a one-letter initial into that slot unconditionally, and
`_onConfigChange` calls `_updateName()` so that already-rendered bubbles pick up a
live change. Every notifying setter therefore filled it: `setLocale` — a language
switcher is enough — `setBubbleActions`, `setIconProvider`. Avatars appeared on a
click that had nothing to do with them, on messages already on screen, and undoing
the click changed nothing because the text was by then written. `_updateRole()` did
the same on a role change.

Both now refresh an initial that is **already there** and never create one. The guard
is "already non-empty" rather than "no avatar provider" on purpose: `avatarInitial` is
part of the `AparteBubbleShellRenderer` contract, so a custom shell may render an
initial and must still see it kept in sync when the name changes. Empty stays empty;
filled stays in sync.

`_renderAvatar`'s documentation claimed it "falls back to the default initial / image
rendered by `_render()`" when no provider is set. There is no such initial — the
default shell renders the slot empty — and believing there was is what made the two
update paths write one. Corrected.

Five tests, both guards seen to fail: reverting the `_updateName` guard reddens the
config-change and name-change cases, reverting the `_updateRole` one reddens the
role-change case. One of them asserts the custom-shell contract still holds, which is
what rules out the narrower fix.
