---
"@aparte/core": patch
---

Nothing changes in your code. `AparteLocale` now documents the eleven keys a plugin renders and core does not — the artifact card's, the compaction summary's, the approval mode picker's and the model selector's — as a closed exception, the localization guide shows a plugin of your own the route that needs no room in that list, and `check:locale-keys` holds the eleven inside this repo.

`AparteLocale` is the closed list of the strings core itself draws, and `t()` is typed against it — which leaves a plugin author exactly one place to put a translatable key. Eleven arrived that way: the artifact card's labels and its two sandbox lines (`@aparte/plugin-artifacts`), the summary title (`@aparte/plugin-compaction`), the mode picker's label (`@aparte/plugin-approval`) and the empty picker's placeholder (`@aparte/plugin-model-selector`). They stay, and they are right where they are: a locale package translates one flat object rather than one per plugin, and a key that ships in every bundle costs a release notice to withdraw. What was missing is that nothing told them apart from core's own words, so a twelfth would have followed by reflex.

The guard reads core and the plugins as two corpora now, and holds the eleven in `PLUGIN_OWNED`. A declared key that only a plugin renders and is absent from that list fails, naming the plugin and the three ways out; a listed key that core has started rendering fails the other way, asking for the line back — a list that outlives its reason is how a guard goes quietly decorative. Both directions run in `scripts/__tests__/check-locale-keys.test.ts` over a doctored locale and a doctored corpus (`--locale`, `--sources`), instead of being described.

It shipped first as nine, because the matcher knew `cfg.t('x')` and `getLocale().x` and not `getLocale()['x']` — the shape `@aparte/plugin-approval` and `@aparte/plugin-model-selector` both use, so their two keys read as nobody's and the guard called the tree clean. The bracket shape counts now, and the suite carries a fixture written that way in both directions. The counts are unchanged: 91 keys, 82 `t('…')` reads.

For a plugin of your own nothing moves: read your string off `getLocale()` and default it at the call site. Your key is yours, and it needs no room in core's list.
