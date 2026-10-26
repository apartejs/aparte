# @aparte/locales

The chat's interface in nine languages for [aparté](https://github.com/apartejs/aparte): every
label, button and screen-reader string the chat draws. Core ships English
(`APARTE_DEFAULT_LOCALE`); install this to switch.

```bash
npm install @aparte/locales @aparte/core
```

```ts
import { aparteGlobalConfig } from '@aparte/core';
import { es } from '@aparte/locales/es';

aparteGlobalConfig.setLocale(es);
```

Each language is its own entry, so a page loads only the one it imports. All of them are also
named exports of the package root.

| Language | Entry | Export | `tag` |
| --- | --- | --- | --- |
| French | `@aparte/locales/fr` | `fr` | `fr-FR` |
| Spanish | `@aparte/locales/es` | `es` | `es` |
| Portuguese (Brazil) | `@aparte/locales/pt-BR` | `ptBR` | `pt-BR` |
| German | `@aparte/locales/de` | `de` | `de` |
| Italian | `@aparte/locales/it` | `it` | `it` |
| Russian | `@aparte/locales/ru` | `ru` | `ru` |
| Japanese | `@aparte/locales/ja` | `ja` | `ja` |
| Korean | `@aparte/locales/ko` | `ko` | `ko` |
| Chinese (Simplified) | `@aparte/locales/zh-CN` | `zhCN` | `zh-CN` |

Every language translates every string core draws, keeps English's placeholders (`{tool}`, `{n}`,
`{name}`…), and is written left to right. The `tag` also sets how dates and numbers are
formatted.

To follow the browser's language, with English when none matches:

```ts
import { aparteGlobalConfig } from '@aparte/core';
import { de, es, fr } from '@aparte/locales';

const byLanguage = { de, es, fr };
const language = navigator.language.slice(0, 2) as keyof typeof byLanguage;
if (byLanguage[language]) aparteGlobalConfig.setLocale(byLanguage[language]);
```

`@aparte/core` is a **peer dependency**. The [Localization guide](https://apartejs.dev/guides/localization/)
covers the whole `AparteLocale` surface, a locale of your own, and strings of your own.

> ESM-only. Part of the aparté monorepo.
