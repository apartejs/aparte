---
"@aparte/angular": minor
---

Set `AparteChatComponent` inputs from code with `componentRef.setInput()`: they are signal inputs now. Templates do not change, and the per-message template can be written as content: `<ng-template aparteBubble let-message>`.

Every input keeps its public name (`[messages]`, `placeholder`, `disabled`, `centerWhenEmpty`, `[bubbleTemplate]`…), so a template binding works as before; what changes is the class member behind it, which is an Angular `InputSignal` rather than a writable property. Code that created the component and assigned `instance.config = …` sets it with `componentRef.setInput('config', …)` instead, which is how Angular sets any input from code.

`AparteBubbleDirective` is new: `<ng-template aparteBubble let-message>` written inside `<aparte-chat>` draws each message, the same as passing a `TemplateRef` to `[bubbleTemplate]`, which still wins when both are given. `[(messages)]` two-way binding is supported and tested: the chat reports its own changes through `messagesChange`, and a write from the parent emits nothing back.

The component renders on the server: the host that drives the custom elements is created after the first render in the browser only, and nothing touches `requestAnimationFrame` during a server render. It also runs under zoneless change detection (the default for a new app since Angular 21); both are covered by specs.
