---
"@aparte/core": patch
---

Swapping a branch no longer conjures a scroll-to-bottom button on a transcript you are
already at the bottom of, and no longer drops you away from the bottom while the new version
renders.

Two things were wrong. `navigateBranch` turned auto-follow **off** unconditionally so a
rebuild wouldn't yank a reader who had scrolled up — but doing that to a reader who was at
the bottom left them behind (a rebuild's height flickers: measured at 1730 → 1934 → 1730px
on the React wrapper as the swapped-in bubble renders and settles) and, since the button
mirrored that flag, offered them a scroll to nowhere. It now keeps auto-follow when you were
at the bottom, and only disables it when you weren't.

And the button stopped mirroring the flag at all: it asks the geometry ("is anything below
the fold?") on every scroll and on every post-mutation frame. The flag is intent, the button
is a fact; mirroring one with the other made it lie whenever they diverged. This was most
visible in the four wrappers, where the post-swap re-derive never ran (the framework owns the
DOM, so that code path returned early), but the flag could go stale in raw core too.
