---
"@aparte/core": patch
---

Presence setters treat `''` as ON, so Svelte templates actually set the attribute (#62).

The attribute types document `''` as the spelling for a presence attribute, because
React and Vue stringify what they set on a custom element. Svelte 5 takes the property
path instead whenever the element has an accessor — and `single={''}` on
`<aparte-split>` (likewise `collapsed`, `disabled`, and the sidebar's `collapsed`)
handed the setter an empty string that `toggleAttribute` read as falsy: the attribute
was removed, the opposite of what the template asked for, silently. On a presence
property an empty string now means ON, exactly as an empty attribute does; `false`,
`null` and `undefined` still mean OFF.
