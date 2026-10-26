---
"@aparte/locales": minor
---

`@aparte/locale-fr` is removed: import `fr` from `@aparte/locales/fr` instead, the same strings. The new package also translates the chat into Spanish, Portuguese (Brazil), German, Italian, Russian, Japanese, Korean and Chinese (Simplified).

```diff
- import { fr } from '@aparte/locale-fr';
+ import { fr } from '@aparte/locales/fr';
```

This removal skips the notice release the stability page promises for a frozen name: `@aparte/locale-fr` leaves in this release, without a release that only deprecates it. Its last version, 0.26.0, stays installable on npm and gets no further release.

Each language is its own entry (`@aparte/locales/es`, `@aparte/locales/pt-BR`, `@aparte/locales/zh-CN`…), so a page loads only the one it imports; all nine are also named exports of the package root (`fr`, `es`, `ptBR`, `de`, `it`, `ru`, `ja`, `ko`, `zhCN`). Every one translates every string core draws, keeps English's placeholders in the same keys, sets a `tag` that `Intl` formats dates and numbers in, and is written left to right.

`check:locale-keys` holds every language of the package to core's list, as it held French: a key core adds and a language leaves out fails the gate instead of showing in English on a translated page.

The eight new languages were translated for this release and have not yet been reviewed by native speakers; corrections are welcome as issues or pull requests.
