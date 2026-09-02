---
"@aparte/core": patch
---

`center-empty` centres the welcome group itself: while the chat is empty, the rows' wrapper carries no block padding, so the empty viewport takes no room in the centred stack.

Measured on the built demo at 768: the chat's centre at 240, the visible group's at 256. The empty viewport still stood 32px tall — the wrapper's block padding with no row in it — and `justify-content: center` centred three items of which the first was invisible. The padding goes, not the box: capping the viewport at 0 would leave a 32px scroll surface inside a 0px box, which the browser smoke test every example runs ("an empty transcript must not overflow") refuses. Framework mode is untouched — there the viewport is the scroll surface and may hold the wrapper's own empty-state content.
