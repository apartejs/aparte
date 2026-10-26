# @aparte/locale-fr

**Deprecated.** French moved to [`@aparte/locales`](https://www.npmjs.com/package/@aparte/locales),
which holds nine languages, one entry each:

```diff
- import { fr } from '@aparte/locale-fr';
+ import { fr } from '@aparte/locales/fr';
```

Until 0.28.0, this package re-exports the same `fr`, so a page that still imports it keeps working.
0.28.0 removes it.

MIT.
