---
'@aparte/core': minor
'@aparte/plugin-subagents': patch
---

Show a step in the page's language: `config.registerStepLabel('reread', ({ locale }) => …)` maps the key a server sends in `step-start` to the words the page shows.

```ts
aparteGlobalConfig.registerStepLabel('slot-wait', 'Waiting for a free slot…');
aparteGlobalConfig.registerStepLabel('reread', ({ locale }) =>
  locale.tag?.startsWith('fr') ? 'Relecture de la conversation…' : 'Re-reading the conversation…');
```

Do you have to touch your code? No: a step nobody labelled is shown as its name, as before. If you rewrite every `step-start` name in a stream runner to reach the page's language, you can stop: the name then stays the key in the run, for a screen reader's text and for what you store.

- **Where it shows.** The waiting indicator beside the dots, the words a screen reader hears in place of "Typing", and a sub-agent's line (`@aparte/plugin-subagents` reads the same label).
- **Live.** A function label is asked again at every change of the locale, and registering a label, or taking it off with the function `registerStepLabel` returns, relabels a step that is already open.
- **Only what is shown is labelled.** The `step-start` and `step-end` events, `observeRunEvents`, the target's `setStep` and anything an app stores keep the key; a step was never saved with the reply.
- **Per config.** One label per name, as the tool displays are: a chat with a config of its own reads that config's labels, not the page's. `getStepLabel(name)` answers what is registered for a name, or `undefined`.
- **Typed.** `AparteStepLabel` and `AparteStepLabelContext` (`{ name, locale }`) are exported. No key is added to `AparteLocale`: the labels are the app's.
