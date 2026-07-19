---
"@aparte/core": patch
---

Type `aparte-composer-change` in the `HTMLElementEventMap` augmentation, so
`el.addEventListener('aparte-composer-change', e => e.detail)` is typed like the other public
events (it's in `DEFAULT_UI_EVENTS`, so the wrappers already forward it). Closes the gap where
a forwarded, typed event was missing from the event map.
