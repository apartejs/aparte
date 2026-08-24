---
title: Localization
description: Translate aparté's built-in UI strings — English ships in core, and @aparte/locale-fr adds French. Pass any AparteLocale to switch.
sidebar:
  order: 7
  label: Localization
---

aparté's built-in UI strings — the composer placeholder, the *Copy* / *Retry* buttons, the *thinking…*
label, and so on — are translatable. English ships **inside core** as `APARTE_DEFAULT_LOCALE`, so an untranslated
app is already in English with nothing to install.

## Switching language

Pass an `AparteLocale` to `aparteGlobalConfig.setLocale`. French is available as a package:

```bash
npm install @aparte/locale-fr
```

```ts
import { aparteGlobalConfig } from '@aparte/core';
import { fr } from '@aparte/locale-fr';

aparteGlobalConfig.setLocale(fr);
```

Set it once at startup, before the chat mounts. `aparteGlobalConfig.getLocale()` returns the active locale, and
`APARTE_DEFAULT_LOCALE` (exported from `@aparte/core`) is the English baseline.

A locale switch is live: mounted components re-render immediately. To go back to English — say, in a
language toggle — call `aparteGlobalConfig.resetLocale()`:

```ts
function setLanguage(lang: 'fr' | 'en') {
  if (lang === 'fr') aparteGlobalConfig.setLocale(fr);
  else aparteGlobalConfig.resetLocale();
}
```

## Writing your own locale

An `AparteLocale` is a flat record of string keys. The simplest custom locale starts from the English
default and overrides what you need:

```ts
import { aparteGlobalConfig, APARTE_DEFAULT_LOCALE, type AparteLocale } from '@aparte/core';

const es: AparteLocale = {
  ...APARTE_DEFAULT_LOCALE,
  inputPlaceholder: 'Escribe un mensaje...',
  sendButton: 'Enviar',
  copy: 'Copiar',
  // …override the rest
};

aparteGlobalConfig.setLocale(es);
```

Spreading `APARTE_DEFAULT_LOCALE` guarantees every key is present even if aparté adds new strings in a later
release — your translation overrides what it covers and inherits English for the rest. The `AparteLocale`
type keeps the keys honest at compile time.

## Localising a plugin

A plugin's strings live in the **same flat object** as core's — `AparteLocale` carries an index
signature, so a key of your own is a key like any other, and `t()` returns it:

```ts
import { aparteGlobalConfig, subscribeConfigChange, APARTE_DEFAULT_LOCALE } from '@aparte/core';

// Your plugin owns both halves: the key AND its English. `t()` returns '' for a key
// nobody supplied, so the plugin's own default belongs at the call site.
const label = (): string => aparteGlobalConfig.t('myPluginRetry') || 'Try again';

// Relabel on a live language switch — the same seam core's own components use.
// It returns an unsubscribe; call it when your element disconnects.
function mount(el: HTMLElement): () => void {
  const paint = (): void => { el.textContent = label(); };
  paint();
  return subscribeConfigChange(el, paint);
}

aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, myPluginRetry: 'Réessayer' });
```

Two things that are not obvious, and that a plugin author will otherwise meet as a bug report:

**`setLocale()` replaces, it does not merge.** So handing core a locale package drops your plugin's
keys — `setLocale(fr)` leaves `myPluginRetry` undefined, because `@aparte/locale-fr` has never heard of
it. The consumer merges:

```ts
import { aparteGlobalConfig } from '@aparte/core';
import { fr } from '@aparte/locale-fr';

aparteGlobalConfig.setLocale({ ...fr, myPluginRetry: 'Réessayer' });
```

**A segment renderer gets this for free.** If your plugin renders a segment type, implement
`relabel(element, segment)` instead of subscribing by hand: core calls it on every config change,
and the rule is attributes and text only — no child node added or removed — so a mounted preview
keeps running and an expanded reasoning block stays expanded. See
[Customization](/guides/customization).

One thing worth *not* translating: strings the **model** reads. `@aparte/plugin-ask-user` keeps its
JSON-schema descriptions and its decline note in English on purpose — those are wire format, not
interface copy. Its visible surface renders the question and the answer, which are data, so the
plugin has nothing to localise at all.
