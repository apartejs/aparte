---
'@aparte/core': patch
---

Setting `value` on `<aparte-select>` from code no longer fires `aparte-select-change`; only a choice the person makes does. If you relied on the event after setting `value` yourself, run your handler there.

The attribute set the value silently and the property announced it, so the same app echoed under Vue, Svelte 5 and a raw tag (which write the property) and not under React's element or Angular's directive (which write the attribute): a value loaded from a saved conversation came back as a change, and a handler saving the person's choice saved one nobody made. Both paths now behave as a native `<select>`. `<aparte-approval-mode>` relays only that event, so a mode set by code (`getApprovalController().setMode(...)` on a switch of conversation) no longer comes out as `aparte-approval-mode-change` either. (apartejs/aparte#295)
