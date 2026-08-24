---
'@aparte/core': minor
---

**A reasoning block is closed by default, and any segment type can be given defaults.**
Breaking for anyone relying on reasoning blocks rendering open, pre-1.0, no shim.

`collapsed` absent used to mean **open**, and core's own stream parser emitted
`collapsed: false` on every thinking segment it produced — so a reasoning block stayed
unfolded for the whole conversation, with the answer buried under it. No assistant on
the market does that: the content sits behind a click, streaming or settled.

Now `collapsed === false` opens a block and anything else closes it. The parser stops
saying it at all. `collapsed: false` is still how you open one on purpose; only *absent*
changed meaning. The old default was pinned by no test, which is how the parser came to
contradict it unnoticed — it is pinned now.

**`setSegmentDefaults(type, defaults)`** is the way to change it for a whole app:

```ts
aparteGlobalConfig.setSegmentDefaults('thinking', { collapsed: false });
aparteGlobalConfig.setSegmentDefaults('my-chart', { theme: 'dark' });
```

It exists because a per-segment field is unreachable for the case that matters: when a
reply streams, the consumer does not construct its segments — the parser does — so there
was nothing to set `collapsed` on. And it is keyed by **type**, not one function per
field: a `setThinkingOpen()` would need a sibling the next time any type wanted a
default, and the type key is a string, so a consumer's own type is covered by the same
call.

Applied where a segment's identity is stamped, which is what makes it cover every
arrival path — `addSegment`, the segments seeded on an `appendMessage`, the framework
host, and the parser's output — with no renderer having to look anything up. Rules:

- a field the producer set always wins, **including an explicit `undefined`** (that is a
  statement, not a gap — the merge asks `key in segment`, not `?? `);
- identity is refused: `id`, `type`, `messageId`, `index`, `startedAt`, `endedAt`. A
  default `id` would hand every segment in a conversation the same one;
- read at insertion and baked in. Changing a default later does not reach segments
  already on screen: a block the reader opened has state the data does not;
- per instance — each chat resolves its own config, so two chats on one page can default
  differently;
- cleared by `reset()`, like every other piece of config.

Also new: `getSegmentDefaults(type)`, `clearSegmentDefaults(type)`, and the
`AparteSegmentDefaults` type.

**Migration.** If your app wants the old behaviour, one line:
`aparteGlobalConfig.setSegmentDefaults('thinking', { collapsed: false })`.
