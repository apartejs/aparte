---
"@aparte/core": patch
---

`AparteAIProviderMetadata` is now really importable from `@aparte/core`. 0.15.0's changelog announced it and the package disagreed: the name had been added to the types module and not to the root barrel, whose type list is explicit, so the import was still TS2724 in the published `dist/index.d.ts`. A consumer checked the tarball. A test now imports it from the barrel, type-checked, so the barrel cannot drop it again quietly.
