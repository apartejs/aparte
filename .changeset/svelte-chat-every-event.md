---
'@aparte/svelte': minor
---

`<AparteChat>` now sends every event of the chat — `on:linkClick` on the Svelte 4 component, `onlinkClick` on the runes one (`@aparte/svelte/runes`), and the same for `retry`, `feedback`, `messageDone`… — and `preventDefault()` on a cancelable one reaches the chat.

```svelte
<!-- @aparte/svelte/runes -->
<AparteChat onlinkClick={(detail, event) => { event.preventDefault(); goto(detail.href); }} />

<!-- @aparte/svelte -->
<AparteChat on:linkClick={(event) => { event.preventDefault(); goto(event.detail.href); }} />
```

Do you have to touch your code? No. `messageSent` and `action` keep their names on both components, as events and as the callback props `onmessageSent` and `onaction`, whose first argument is still the detail: a callback written for it alone still fits.

- **Every event.** The events are generated from the ones `<aparte-chat>` declares, 23 today: the composer's (`messageSent`, `stop`, `composerChange`, `actionClick`), the transcript's and each message's (`pathChanged`, `retry`, `edit`, `feedback`, `linkClick`…) and the turn's (`messageStart`, `messageDone`, `messageError`…). A name is the event's without `aparte-`, in camelCase — save `aparte-send`, which is `messageSent`, and `aparte-cancel`, which is `stop`. An event the chat gains reaches both components with no change to this package.
- **The runes component** takes a callback prop for each — `on` and the name, as Svelte spells it — called with the detail, then the DOM event.
- **The Svelte 4 component** dispatches a component event for each, the detail under `event.detail`. `preventDefault()` on it cancels the chat's event: `aparte-link-click` is cancelable, and cancelled it keeps the browser from following the link. `onmessageSent` and `onaction` stay, and now also receive the DOM event as their second argument.
- **Why.** Both components exposed two of the chat's events; the rest could only be reached through a DOM listener on their root.
