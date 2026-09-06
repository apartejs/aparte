---
"@aparte/core": patch
---

`fallback` is declared on every segment, not only on `type: 'custom'` — the renderer already read it that way.

**Nothing to change.** The field moves up from `AparteCustomSegment` to `AparteSegmentBase`, so the six built-in segment types declare it, and so does any type of your own written as `AparteSegmentBase & { type: '…' }`. Anything that already set it on a custom segment still compiles.

What it buys you: a segment whose renderer is not registered draws its `fallback` sentence instead of `[Unknown segment type: …]`, and that has always been true for EVERY type, because the bubble reads the field structurally. Only the declaration was narrow — a built-in segment could not type the sentence it was about to be rendered from:

```ts
import type { AparteSegmentBase, AparteTextSegment } from '@aparte/core';

// A built-in type, carrying what a client with no markdown renderer will draw.
const text: AparteTextSegment = {
  id: 's1',
  type: 'text',
  content: '**A transport** is the object that talks to the model.',
  fallback: 'A transport is the object that talks to the model.',
};

// Your own type is the same base plus a `type` of yours — no cast, and `fallback`
// is declared for you.
type CitationSegment = AparteSegmentBase & { type: 'citation'; url: string };
const citation: CitationSegment = {
  id: 's2',
  type: 'citation',
  url: 'https://example.org/weather',
  fallback: 'Weather report, 6 September.',
};
```

One clause of the field's documentation was wrong and is corrected. In the HISTORY sent back to the model, `fallback` stands in for the segment only where core does not serialise the type itself — `custom`, and any type core does not know (a registered block grammar's, a plugin's). A `text` or a `code` segment contributes its `content` and nothing else, and `thinking` / `tool_call` / `error` are kept out of the history on purpose. The docblock used to promise the substitution for every type; the behaviour is unchanged, the sentence is.

Supplying a fallback also silences the "no renderer for segment" developer warning: an author who wrote one has already said this can happen.
