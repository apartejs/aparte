---
'@aparte/angular': minor
---

`AparteChatComponent` gains `getElement()`, the host `<aparte-chat>`, and `getComposer()`, its `<aparte-composer>`.

```html
<aparte-chat (aparte-subagent-open)="openPanel($event.detail)"></aparte-chat>
```

Do you have to touch your code? No. A plugin's event is already a native `(aparte-…)` binding on the tag, since the host IS the core element; a test pins that it fires once, beside `(linkClick)`.
