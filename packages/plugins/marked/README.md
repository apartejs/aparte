# @aparte/plugin-marked

Markdown rendering for [aparté](https://github.com/apartejs/aparte) via
[marked](https://marked.js.org). Registers the **one-shot** Markdown provider used for finished /
re-rendered message bubbles.

```bash
npm install @aparte/plugin-marked @aparte/core marked
```

```ts
import { setupMarkedProvider } from '@aparte/plugin-marked';

setupMarkedProvider({ gfm: true, breaks: true }); // options are optional
```

`@aparte/core` and `marked` are **peer dependencies**. For token-by-token incremental rendering during
streaming, add `@aparte/plugin-streaming-markdown` alongside this.

> ESM-only. Part of the aparté monorepo.
