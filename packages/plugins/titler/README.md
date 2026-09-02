# @aparte/plugin-titler

Auto-title conversations in [aparté](https://github.com/apartejs/aparte) with an
[aparte-titler](https://apartejs.dev/models/titler/) model: 3 to 6 words picked out of the
first message, in the browser, no API call. The model weighs 40 to 133 KB and titles in a few
milliseconds.

```bash
npm install @aparte/plugin-titler @aparte/titler-latin
```

```ts
import { loadTitler } from '@aparte/titler-latin';   // 17 European languages, 133 KB
import { setupTitler } from '@aparte/plugin-titler';

setupTitler(manager, { titler: loadTitler });        // manager: your AparteConversationManager
```

`loadTitler` is called once, the first time a conversation needs a title — the model is not on
the page's critical path. A `Titler` instance or a promise of one (`loadTitler()`) is accepted
in the same place, and so is any object with `title(message, budget?)` of your own
(`TitlerLike`). `budget` caps the number of words (the model's default is 6).

`setupTitler` returns a teardown that gives the manager back the provider it had. For a manager
built with the `titleProvider` option, `createTitleProvider(options)` is the provider alone:

```ts
const manager = new AparteConversationManager(adapter, {
    titleProvider: createTitleProvider({ titler: loadTitler, budget: 4 }),
});
```

An empty answer or a failed load leaves the default title (the message as typed): a titler that
fails never loses the message from the sidebar.

Pick the model for your languages — `@aparte/titler-latin` (17 languages, 133 KB),
`@aparte/titler-latin-mini` (the same 17, 96 KB), `@aparte/titler-efigsp` (en, fr, es, de, pt,
it, 77 KB), or `@aparte/titler` with a single-language file (40 KB) from the
[model repository](https://huggingface.co/apartejs/aparte-titler).

> ESM-only. Part of the aparté monorepo. Try the model at [apartejs.dev/models/titler/#demo](https://apartejs.dev/models/titler/#demo).
