---
"@aparte/core": patch
---

`check:locale-keys` now refuses a new `AparteLocale` key that only a plugin renders; the nine existing ones are listed as a closed exception. Nothing to change in your code — the rule runs inside this repo, and what ships is the paragraph in `AparteLocale`'s documentation naming those nine.

`AparteLocale` is the closed list of the strings core itself draws, and `t()` is typed against it — which leaves a plugin author exactly one place to put a translatable key. Nine arrived that way: the artifact card's labels and its two sandbox lines (`@aparte/plugin-artifacts`), and the summary title (`@aparte/plugin-compaction`). They stay, and they are right where they are: a locale package translates one flat object rather than one per plugin, and a key that ships in every bundle costs a release notice to withdraw. What was missing is that nothing told them apart from core's own words, so a tenth would have followed by reflex.

The guard reads core and the plugins as two corpora now, and holds the nine in `PLUGIN_OWNED`. A declared key that only a plugin renders and is absent from that list fails, naming the plugin and the three ways out; a listed key that core has started rendering fails the other way, asking for the line back — a list that outlives its reason is how a guard goes quietly decorative. Both directions run in `scripts/__tests__/check-locale-keys.test.ts` over a doctored locale and a doctored corpus (`--locale`, `--sources`), instead of being described. The counts are unchanged: 91 keys, 82 `t('…')` reads.

For a plugin of your own nothing moves, and the localization guide now says so where a reader meets the nine: read your string off `getLocale()` and default it at the call site. Your key is yours, and it needs no room in core's list.
