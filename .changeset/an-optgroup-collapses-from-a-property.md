---
"@aparte/core": patch
---

`<aparte-optgroup collapsible>` no longer throws under React 19 and Svelte 5: the property has a setter, and assigning it toggles the attribute.

React 19 and Svelte 5 write the PROPERTY whenever the element has one of that name, and fall back to the attribute only when it does not. `collapsible` was a getter with no setter beside `collapsed`, which has one — so the assignment threw `Cannot set property collapsible of #<AparteOptgroup> which has only a getter` and took the whole render down, on a spelling the typed JSX/Svelte surfaces declare valid and the element's own `@example` shows. The in-repo emitter was safe by accident: `@aparte/plugin-model-selector` builds its groups as an HTML string.

The same shape is now asserted for the select family as a whole rather than for the one case: an attribute those elements declare is either absent as a property or writable as one — never getter-only.
