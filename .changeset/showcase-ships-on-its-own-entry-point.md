---
"@aparte/provider-scenario": minor
---

Import `showcase` from `@aparte/provider-scenario/showcase`; the root export is deprecated and removed in this release. One line changes: `import { createScenarioProvider, showcase } from '@aparte/provider-scenario'` becomes an import of `createScenarioProvider` from the root and one of `showcase` from `@aparte/provider-scenario/showcase`. Nothing else moves — the scenario format, `createScenarioProvider`, `defaultMatch` and `playTurn` are untouched.

`showcase` is a demo corpus, not a capability: twelve scripted turns with their markdown, their code block, their reasoning and their artifact, about 4 kB of the package. It sat on the root barrel, so a consumer who wrote their own scenarios shipped it anyway — runtime laziness is not distribution weight, and the lever for weight is a separate entry point, not a flag.

The provider and the corpus now build as two entries, and the scenario page, the README and the docs' live frames all import it from the subpath.
