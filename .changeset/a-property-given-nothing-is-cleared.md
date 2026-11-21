---
'@aparte/core': patch
'@aparte/angular': patch
'@aparte/react': patch
'@aparte/vue': patch
'@aparte/svelte': patch
---

A property input given `undefined`, `null` or `false` now clears the element's property: `[moveTargets]="canMove ? groups : undefined"` in Angular, or a key kept in an `<AparteUi>` bag with no value (`moveTargets: canMove && groups`).

Only the attribute of the same name was removed, and the element went on with the old array or function: rows kept offering "Move to…", an old `renderMeta` kept drawing. A key given an object or a function before is a property, and is cleared as one.
