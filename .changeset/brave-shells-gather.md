---
"@aparte/core": minor
---

Add the `<aparte-chat>` shell — the container element for a chat. Wrap a viewport
and a composer in it and it lays them out as a flex column; leave it empty and it
fills in a default composition:

```html
<!-- default composition -->
<aparte-chat center-empty placeholder="Say something…" style="height: 600px"></aparte-chat>

<!-- or your own primitives inside, still laid out + center-empty -->
<aparte-chat center-empty>
  <aparte-chat-viewport></aparte-chat-viewport>
  <aparte-composer>…</aparte-composer>
</aparte-chat>
```

Being a component, it owns behaviour a wrapper `<div>` can't: with the opt-in
`center-empty` attribute it watches its own viewport and keeps the composer
centered as a welcome state until the first message, then slides to the normal
layout — no external JavaScript. Presentational only (no transport wiring);
`placeholder` / `disabled` forward to the composer, and `.viewport` / `.composer`
getters expose the composed elements.
