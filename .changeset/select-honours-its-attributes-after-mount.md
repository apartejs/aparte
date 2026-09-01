---
"@aparte/core": patch
---

`<aparte-select>` now honours `placeholder` and `disabled` written after mount, its presence setters (and `<aparte-option>`'s, `<aparte-optgroup>`'s) accept the empty string as ON, the unread `grouped` attribute is gone, and a loading group says `loading` from the locale instead of "Fetching models...".

Both attributes were observed and neither had a branch in the change callback, so a placeholder rewritten by a locale switch left the visible label and the combobox's `aria-label` in the old language, and a select disabled after mount kept a trigger in the tab order, announced as operable. The trigger now takes `aria-disabled="true"` and `tabindex="-1"` while disabled (an open dropdown closes), and the label and both `aria-label`s follow the placeholder. Five setters (`open`, `selected`, `disabled`, `collapsed`, `loading`) still read `''` as false, so a Svelte 5 template that set them removed the attribute; they use the same spelling as the split and the sidebar now, and one test enumerates all nine presence setters in core. `grouped` was observed and read by nothing (groups render from `<aparte-optgroup>` children alone); it leaves the attribute list and the docs. New locale key: `loading` (default "Loading…").
