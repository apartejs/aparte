---
"@aparte/core": patch
---

`<aparte-context>`'s `aparte-compact` event is now in the manifest and on its docs page.

The gauge has dispatched it on `window` since `auto-compact` existed — that is the whole of what the attribute does — and it carried no `@fires`, so it was absent from the shipped custom-elements manifest, from the element's generated page, and from the editor tooltip a consumer reads. It was typed in `AparteEventMap` and described in prose the entire time, which is what made it invisible: every list a reader consults said the element fires one event.

The dispatch is typed with its detail (`AparteCompactEventDetail`) rather than an anonymous `CustomEvent`, and the event map's comment is corrected — it said "Core never sends these" of a block of five, which was false of four of them, the gauge's own included.
