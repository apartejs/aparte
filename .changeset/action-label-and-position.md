---
'@aparte/core': minor
---

A registered message action can show its label as text and stand before the built-in buttons: `registerAction({ …, display: 'label', position: 'start' })`. Existing actions are unchanged.

`display` is `'icon'` (the default, as before), `'label'` or `'both'`. `icon` is optional with `'label'`, and a button left with no icon to draw shows its label rather than an empty box. A button that shows its label is named by it, with no tooltip repeating it. `position` is `'end'` (the default, as before) or `'start'`; `order` sorts the actions on each side.

`label` is now read as a key of the locale when the locale has it, as its documentation already said and the bubble did not do: add yours with `extendLocale`, and the words follow the chat's language. A label the locale does not have is shown as written.
