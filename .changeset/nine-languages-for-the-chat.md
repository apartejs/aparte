---
"@aparte/locales": minor
---

Replace `@aparte/locale-fr` with `@aparte/locales`: import `fr` from `@aparte/locales/fr` instead. The new package also translates the chat into Spanish, Portuguese (Brazil), German, Italian, Russian, Japanese, Korean and Chinese (Simplified).

```diff
- import { fr } from '@aparte/locale-fr';
+ import { fr } from '@aparte/locales/fr';
```

`@aparte/locale-fr` is deprecated: for one release it re-exports the same `fr` from `@aparte/locales`, so an upgrade breaks nothing, and 0.28.0 removes it.

Each language is its own entry (`@aparte/locales/es`, `@aparte/locales/pt-BR`, `@aparte/locales/zh-CN`…), so a page loads only the one it imports; all nine are also named exports of the package root (`fr`, `es`, `ptBR`, `de`, `it`, `ru`, `ja`, `ko`, `zhCN`). Every one translates all 130 strings core draws, keeps English's placeholders in the same keys, sets a `tag` that `Intl` formats dates and numbers in, and is written left to right.

`check:locale-keys` holds every language of the package to core's list, as it held French: a key core adds and a language leaves out fails the gate instead of showing in English on a translated page.

The eight new languages were translated for this release and have not yet been reviewed by native speakers; corrections are welcome as issues or pull requests.
