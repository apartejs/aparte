# @aparte/locale-fr

French locale for [aparté](https://github.com/apartejs/aparte). Core ships English
(`DEFAULT_LOCALE`) out of the box — install this only to switch to French.

```bash
npm install @aparte/locale-fr @aparte/core
```

```ts
import { AparteConfig } from '@aparte/core';
import { fr } from '@aparte/locale-fr';

AparteConfig.setLocale(fr);
```

`@aparte/core` is a **peer dependency**. See the [Localization guide](https://github.com/apartejs/aparte)
for the full `AparteLocale` surface.

> ESM-only. Part of the aparté monorepo.
