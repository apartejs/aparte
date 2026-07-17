---
title: Localization
description: Translate aparté's built-in UI strings — English ships in core, and @aparte/locale-fr adds French. Pass any AparteLocale to switch.
sidebar:
  order: 7
  label: Localization
---

aparté's built-in UI strings — the composer placeholder, the *Copy* / *Retry* buttons, the *thinking…*
label, and so on — are translatable. English ships **inside core** as `DEFAULT_LOCALE`, so an untranslated
app is already in English with nothing to install.

## Switching language

Pass an `AparteLocale` to `AparteConfig.setLocale`. French is available as a package:

```bash
npm install @aparte/locale-fr
```

```ts
import { AparteConfig } from '@aparte/core';
import { fr } from '@aparte/locale-fr';

AparteConfig.setLocale(fr);
```

Set it once at startup, before the chat mounts. `AparteConfig.getLocale()` returns the active locale, and
`DEFAULT_LOCALE` (exported from `@aparte/core`) is the English baseline.

## Writing your own locale

An `AparteLocale` is a flat record of string keys. The simplest custom locale starts from the English
default and overrides what you need:

```ts
import { AparteConfig, DEFAULT_LOCALE, type AparteLocale } from '@aparte/core';

const es: AparteLocale = {
  ...DEFAULT_LOCALE,
  inputPlaceholder: 'Escribe un mensaje...',
  sendButton: 'Enviar',
  copy: 'Copiar',
  // …override the rest
};

AparteConfig.setLocale(es);
```

Spreading `DEFAULT_LOCALE` guarantees every key is present even if aparté adds new strings in a later
release — your translation overrides what it covers and inherits English for the rest. The `AparteLocale`
type keeps the keys honest at compile time.
