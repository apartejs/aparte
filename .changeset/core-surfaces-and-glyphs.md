---
'@aparte/core': minor
---

Add `--aparte-warning-surface` and `--aparte-info-surface`, and the `chevronDownIcon`, `chevronUpIcon` and `panelLeftIcon` glyphs in `@aparte/core/icons`.

The two surfaces complete the intent family: success and error had one, warning and info did not, so a rule reading them got an invalid value and painted nothing. They use the same recipe. The chevrons name by direction what `expand` and `collapse` name by state; `panelLeft` is the usual glyph for a desktop sidebar toggle.
