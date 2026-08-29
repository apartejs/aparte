---
"@aparte/core": minor
---

A link in a model's reply can no longer choose its own target: unless it is a `_self` on a link that was staying here anyway, it opens in a new tab with `rel="noopener noreferrer"`.

Breaking for model-authored markup only — no caller code changes, but a reply that writes `target="_top"`, `target="frame"` or a `rel` of its own no longer gets what it asked for. Nothing a *host* writes is affected: the sanitizer only ever reads provider output.

`target` and `rel` used to be allowlisted on `<a>` and copied through untouched, which handed the model two things. `_top`/`_parent` broke out of the frame the chat lives in — no external URL required, a same-site link did it — and in an Electron window that frame is the whole application. A NAMED target (`target="victimframe"`) opened a page holding a live `window.opener`, which is the reverse-tabnabbing the `_blank` branch has always hardened against; `rel="opener"` simply cancelled that hardening. The attribute is now read as a wish and clamped: everything becomes a new tab that cannot reach back, and a model-written `rel` never survives. `_self` is the one wish honoured, and only where it changes nothing a browser would not already do — on a same-site or in-page link. On an off-site href it is not a preference but a downgrade: that link opens a new tab when no `target` is written at all, so honouring `_self` there would hand the model exactly the frame navigation this clamp refuses.
