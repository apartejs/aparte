---
"@aparte/plugin-marked": minor
---

New `@aparte/plugin-marked/streaming` entry: `setupMarkedStreamingProvider()` formats a reply with marked while it streams and once it is done, so a finished reply no longer changes when it settles.

```ts
import { setupMarkedStreamingProvider } from '@aparte/plugin-marked/streaming';

setupMarkedStreamingProvider(); // in place of setupMarkedProvider() + setupStreamingMarkdownProvider()
```

While a reply streams, the block being written is completed by Vercel's `remend` before marked parses it: `**bold` shows bold before its closing `**` arrives, a `**` with nothing after it yet is held back instead of shown as typed, a link shows as a link from its first character and becomes clickable once its URL is complete, and an image appears once its URL is. Only that block is drawn again at each chunk; the blocks above it keep their DOM, so a selection in them survives the stream. Every block goes through the config's sanitizer, external links to their own tab included. The options are marked's, as for `setupMarkedProvider`, and apply to the streaming and the finished render alike.

`remend` is a new dependency of the plugin (Apache-2.0, no dependencies of its own), imported by the `/streaming` entry only: the main entry's graph is unchanged. `@aparte/plugin-streaming-markdown` stays the choice that only appends to the page.
