---
"@aparte/core": patch
---

The viewport keeps confirming its scroll position while a rebuilt transcript's height is still settling, instead of giving up at the first frame the gap looks closed.

A layout settles in stages, so one `scrollTop` assignment is not enough and the viewport confirms it over the frames that follow. That confirmation was bounded by four frames and stopped at the first frame the gap was closed — and a rebuild is exactly the case that re-opens it. Measured on react-webkit: a branch swap churned the scrollable max 891 -> 1091 -> 891, the gap closed against the tall layout so the chain ended, the height then fell back with the engine holding the position at 720, and the transcript stood 171px short with auto-follow still armed and a scroll-to-bottom button on a reader who never left.

Two changes. The confirmation is bounded by 400ms instead of four frames — a frame count is a proxy for time that fails precisely on the slow engine — and it keeps watching after a gap closes, until the window is over. And a decrease the reader did not make, which leaves a gap while the follow is armed, re-opens that window; nothing else could close it, since the rebuild's mutations are over and the resize observer watches the host's box, not the transcript's content.

A reader is still left alone: the intent flag is re-read every frame, and a gesture, a drag-selection upward or a find-in-page jump all disarm the follow before the new path can be reached. A scroll of ours that is still moving down is left alone too — that is every frame of a smooth scroll, and re-anchoring one of them would abort the animation. During a stream the confirmation is now one chain rather than one per token.

What this does NOT close: the react-webkit branch-swap failure that started the investigation still reproduces at the same rate (18/20 first attempt, with and without this change). Its captured mechanism is a different one — WebKit moves the position up by 36-338px with the scroll height standing still, before the press, which the classifier reads as the reader and disarms the follow — so both new paths, gated on the follow being armed, are inert on it.
