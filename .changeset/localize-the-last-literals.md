---
'@aparte/core': minor
'@aparte/locale-fr': minor
---

**Eight strings that could not be translated in any language now can.** Additive: five
new optional locale keys, and one required key that already existed and was read by
nothing.

Switching the locale left these in English, in every language, forever — no reload
helped, because they were literals in the markup rather than lookups:

| where | was | key |
| --- | --- | --- |
| error segment heading | `Error` | `error` — **already existed** |
| artifact card download button | `Download` (title + aria-label) | `download` |
| binary artifact download buttons (x2) | `Download` | `download` |
| artifact card tabs | `Preview` / `Code` | `preview`, `code` |
| binary artifact status | `Generating…` / `Rebuilding preview…` | `generating`, `rebuildingPreview` |
| `pipeline-waiting` accessible name | `Generating…` | `generating` |

The error heading is the one worth pausing on. `locale.error` is a **required** key,
documented under Status Indicators, defaulting to `"Error"`, and `@aparte/locale-fr` has
shipped `"Erreur"` for it since it existed — while nothing in the library read it and the
card next to it hardcoded `Error`. A translated string with no consumer and a literal
with no translation, in the same component.

Four of the eight are an `aria-label` or a `title` with no visible text, which is why they
survived: nothing on screen was in the wrong language, so only a screen-reader user or
someone hovering would ever have met them. `pipeline-waiting` is the extreme case — three
CSS dots and an accessible name, so that name is the segment's entire content as far as a
screen reader is concerned, and it announced English in every locale.

All of them also update **live**, through the `relabel` hook: `setLocale()` on a rendered
transcript now moves them without rebuilding the segments, so a mounted preview keeps
running and an expanded reasoning block stays expanded. The artifact card's tabs are
relabelled by text only — `aria-selected` and `data-tab` are the reader's state, not the
locale's, and a relabel that touched them would close a preview somebody had opened.

Also fixed in passing, because it was the same defect one line up: the artifact card's
copy button put `t('copy')` in its `title` and the literal `"Copy"` in its `aria-label`,
so a French reader got a French tooltip and an English announcement.

Knowingly left: `aria-label="Streaming"` on the card's pulse indicator. It sits on a
`<span>` with no role, where an accessible name is not reliably announced at all, so a
key for it would translate something nothing reads. It needs a role before it needs a
translation.

Found by sweeping for the pattern rather than trusting the list: the count went from
four to six while writing the keys, and to eight when a regex over every `title=`,
`aria-label=` and `>Word<` in core found two more `Download` buttons on the binary
artifact path — a second renderer with its own buttons, which no reading of the first
one would have surfaced.
