---
"@aparte/plugin-approval": patch
"@aparte/plugin-model-selector": patch
---

`<aparte-approval-mode>` and `<aparte-model-selector>` now wait for a server-rendered chat to hydrate before they draw.

Placed in the toolbar of a server-rendered `<AparteChat>`, either tag drew itself as soon as its plugin was imported — before the framework had hydrated the page — so React found children it had not rendered and threw the server's HTML away (error 418). Both now honour `defer-hydration`, like core's own elements, and draw when the wrapper releases the chat. `<aparte-ask-user>` already did, through the `<aparte-elicitation>` it extends. An element of your own that draws itself on connect can do the same: call `deferHydrationOf(YourElement)` before `customElements.define`.
