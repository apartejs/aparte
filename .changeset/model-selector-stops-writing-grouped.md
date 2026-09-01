---
"@aparte/plugin-model-selector": patch
---

Stops writing the `grouped` attribute on its `<aparte-select>`: the select never read it, groups render from the `<aparte-optgroup>` children alone.
