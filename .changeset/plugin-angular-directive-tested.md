---
---

The plugin's generated Angular directive gets the tests it never had — 13 of them, on
`@aparte/plugin-model-selector`.

Deliberately EMPTY, because nothing publishable moved: the tests are new, and the
`tsconfig.json` change only stops `tsc -b --emitDeclarationOnly` from writing the new
spec's declarations into `dist`. No `@aparte/*` package changes behaviour, API or CSS.
It exists because the CI guard asks every PR for a changeset, and "no release" is the
answer rather than an excuse to skip the guard.
