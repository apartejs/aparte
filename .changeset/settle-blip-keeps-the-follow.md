---
"@aparte/core": patch
---

On WebKit the transcript no longer settles a few pixels short of the bottom — with a scroll-to-bottom button showing — when a streamed reply ends or a branch is swapped at the bottom.

The action bar appearing at the end of a stream (+34px) and the bottom spacer giving those pixels back happen in one frame, and through that churn WebKit moves `scrollTop` backwards by ~25px. Since queued scroll frames started re-reading the reader's intent, that browser-made decrease read as "the reader went up" and disarmed the follow mid-landing. A decrease now counts as the reader's unless it is small, comes within a second of a scroll the viewport asked for, and no wheel, touch, pointer or key touched the transcript in that second — a real gesture always leaves that trace, and a large jump is never layout churn.
