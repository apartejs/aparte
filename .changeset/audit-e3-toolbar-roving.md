---
"@aparte/core": minor
---

The message action bar is now one tab stop with Left/Right arrows inside it, as its `role="toolbar"` always claimed.

Tabbing through a transcript is shorter: each bubble's bar contributes one stop instead of one per button. Inside a bar, Left and Right move and wrap, Home and End jump to the ends, and disabled buttons are skipped — while a turn is streaming, retry and edit are disabled, and a toolbar whose arrows stop on a dead control reads as broken. The arrows follow the reading direction, so in an RTL transcript Left is the one that advances.

The bar has announced itself as a toolbar since it existed, and a toolbar IS the roving-tabindex pattern: one member in the tab order, the arrows moving between them. What shipped was five independent tab stops per message, so the role described a behaviour that did not exist — a screen-reader user told "toolbar, five items" pressed Right and nothing moved.

The model is re-derived in the one place all three build paths already funnel through, rather than in each builder, because the bar's `innerHTML` is rewritten on a `setBubbleActions`, on entering and leaving the inline editor, and on a config change. A per-builder fix drifts the first time somebody adds a fourth path; the rebuild cases in the suite are what would catch that.
