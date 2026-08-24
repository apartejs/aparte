---
'@aparte/core': minor
'@aparte/locale-fr': minor
---

**The language lever, finished: four more strings, and the clock.** Additive — five new
optional keys, one of which is not a string at all.

Both halves were found by a person switching the language in a browser and reading the
screen, after a cross-check of every key core reads against every key it declares had
already been run. The list said nothing was missing; the screen disagreed twice.

**`actionUpload` was read and never declared.** `aparte-composer-add-attachment` has
called `t('actionUpload')` since it existed, and no locale ever declared that key — so
`t()` returned `''` and the `|| 'Attach file'` fallback rendered in every language, after
every reload. That is the **third** instance of this exact defect, after `submitButton`
and `stopButton`. A key read and not declared is invisible from either side: the
component looks correct and the locale looks complete. Only cross-checking the two lists
finds it, and that check is now the routine.

Three more that were plain literals: the artifact preview pane's one sentence
(`previewPending`), and the sandbox failure's heading and hint (`sandboxError`,
`sandboxErrorHint`). The sandbox's own error text between them stays untranslated on
purpose — that is the tool's output, not the library's copy.

**`tag` — a BCP-47 language tag, because a clock is not a string.**

The only `Intl` call in the library passed `undefined` as its locale:

```ts
date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
```

`undefined` means *follow the browser*. So `setLocale(fr)` moved fifty strings and left
the timestamp above every message reading `7:32 PM`, because the browser had never been
asked. French is 24-hour.

A tag and **not** an `hour12` flag: a flag answers one question at one call site, a tag
answers every question `Intl` can be asked — hour cycle, date order, month names,
decimal separator, relative time, list joining — for every locale, including the ones
nobody here can enumerate. `direction` next door is the precedent: the locale's metadata
section already holds how a language *behaves*, not what its words are.

The English default declares **no** tag, deliberately: `undefined` keeps following the
browser, which is the right default for a library and the behaviour every consumer has
today. `@aparte/locale-fr` declares `tag: "fr-FR"` — if you have chosen French strings,
French formatting is what you meant. A timestamp also re-renders on a config change, or
the language would switch around a 12-hour time that stayed put.

`@aparte/locale-fr` now covers every key core declares: 25 required, 25 optional, none
missing.
