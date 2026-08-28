---
"@aparte/core": patch
---

On WebKit the transcript no longer settles a few pixels short of the bottom — with a scroll-to-bottom button showing — when a streamed reply ends or a branch is swapped at the bottom.

The action bar appearing at the end of a stream and the bottom spacer giving those pixels back happen in one frame, and through that churn WebKit moves `scrollTop` backwards; a branch swap on React flickers the height by ~200px and moves it by as much. Since queued scroll frames re-read the reader's intent, those browser-made decreases read as "the reader went up" and disarmed the follow mid-landing. A decrease now counts as the reader's unless three things hold: it is no larger than the scroll height moved since the last scroll event (churn moves `scrollTop` by at most the height it changed; a reader, a find-in-page jump or a host's `scrollTo` move it with the height standing still), it comes within a second of a scroll the viewport asked for, and no scroll gesture touched the transcript in that second — a wheel notch, a touch that moves, a navigation key, or a press in the scrollbar's gutter. A click or a tap on a control inside the transcript (a branch arrow, copy) is not a scroll gesture.
