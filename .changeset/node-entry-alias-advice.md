---
'@aparte/core': patch
---

The warning `registerAllComponents()` prints when a test runner resolved core's Node entry under a DOM now gives the alias the docs give, matching the bare specifier only: `test.alias [{ find: /^@aparte\/core$/, replacement: '@aparte/core/browser' }]`.

It suggested `{ '@aparte/core': '@aparte/core/browser' }`, a string alias, which is a prefix: it also rewrote `@aparte/core/icons` to `@aparte/core/browser/icons`, a path that does not exist.
