# @aparte/locale-fr

French locale for [aparté](https://github.com/apartejs/aparte). Core ships English
(`APARTE_DEFAULT_LOCALE`) out of the box — install this only to switch to French.

```bash
npm install @aparte/locale-fr @aparte/core
```

```ts
import { aparteGlobalConfig } from '@aparte/core';
import { fr } from '@aparte/locale-fr';

aparteGlobalConfig.setLocale(fr);
```

To toggle back and forth at runtime (e.g. a language switcher), use
`resetLocale()` to return to the built-in English:

```ts
function setLanguage(lang: 'fr' | 'en') {
    if (lang === 'fr') aparteGlobalConfig.setLocale(fr);
    else aparteGlobalConfig.resetLocale();
}
```

`@aparte/core` is a **peer dependency**. See the [Localization guide](https://apartejs.dev/guides/localization/)
for the full `AparteLocale` surface.

> ESM-only. Part of the aparté monorepo.
