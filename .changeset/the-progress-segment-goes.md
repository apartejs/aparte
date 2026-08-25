---
'@aparte/core': minor
---

**The `progress` segment is removed.** `AparteProgressSegment`, `progressRenderer`, its registration in `registerDefaultRenderers()`, its CSS and its three `--aparte-progress-*` variables all go. Breaking, pre-1.0, with no alias and no shim.

No language model emits a progress bar. Not chat-completions, not Anthropic's messages API, not the AI SDK's stream protocol — a model emits text, reasoning, tool calls, tool results and sometimes citations. And nothing in this repo emitted one either: the only in-repo `'progress'` is a worker→main message in `@aparte/provider-transformers` reporting **model download** progress to an `onProgress` callback, which is a name collision and never a segment.

`label` + `percent` + `status` are the signature of an app that owns the work — word for word the reason the `terminal` segment was removed, and the sixth segment type to go for it. The line it sits on the wrong side of is visible one file away: `pipeline-waiting` stays, because **core emits that one itself** between the phases of a multi-step turn. Core-owned indicator, not app-owned data.

An app that wants a progress bar has the seam for it: `registerSegmentRenderer` with a segment type of its own. That is the same answer this library gives for a terminal, and it is a better one than a built-in nothing fills.

Also fixes the landing's hero, which claimed "ten kinds of content" over a list of eight. The count is computed from the list now, so it cannot drift again; it reads seven.
