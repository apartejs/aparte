---
'@aparte/plugin-subagents': patch
'@aparte/core': minor
---

A sub-agent opened by another sub-agent, saved while it waited for an approval, now goes on on its own line in its parent's transcript when the reply is resumed after a reload.

Its saved line was looked for in the reply's own segments only, so its resumed work was dropped, or went to a second, top-level line, and its call stayed awaiting approval. The plugin now finds it at any depth and takes up the sub-agents it sits under first. `createSegmentList` gains a `paused` option for that: a saved list taken up as a pause keeps its calls waiting for an approval open, where history aborts them.
