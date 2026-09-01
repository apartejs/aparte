---
"@aparte/core": patch
---

`<aparte-chat submit-on-enter="false">` now reaches the composer it composes, and the menu, popover, dialog and tooltip each get a radius knob (`--aparte-radius-menu`, `--aparte-radius-popover`, `--aparte-radius-dialog`, `--aparte-radius-tooltip`).

The shell forwarded `placeholder` and `disabled` only, so the one switch every wrapper exposes as `submitOnEnter` had no vanilla spelling short of reaching inside for the composer. It is forwarded by value (the bare attribute keeps the default, Enter sends) and observed, so a toggle after mount follows. The four floating surfaces read a step of the radius scale directly, the only family without a knob of its own: a theme that wanted square menus and round bubbles had to move the scale step and every other reader with it. Rendering is unchanged; the four knobs default to the steps the sheets read before.
