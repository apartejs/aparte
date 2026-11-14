---
'@aparte/vue': minor
---

`<AparteChat>` now emits every event of the chat — `@link-click`, `@retry`, `@feedback`, `@message-done`… — and each listener receives the event after its detail, so `event.preventDefault()` works.

```vue
<AparteChat @link-click="(detail, event) => { event.preventDefault(); router.push(detail.href); }" />
```

Do you have to touch your code? No. `@message-sent` and `@action` keep their names, and their first argument is still the detail: a listener written for it alone still fits.

- **Every event.** The emits are generated from the events `<aparte-chat>` declares, 23 today: the composer's (`@message-sent`, `@stop`, `@composer-change`, `@action-click`), the transcript's and each message's (`@path-changed`, `@retry`, `@edit`, `@feedback`, `@link-click`…) and the turn's (`@message-start`, `@message-done`, `@message-error`…). An emit is the event's name without `aparte-` — save `aparte-send`, which is `messageSent`, and `aparte-cancel`, which is `stop`. An event the chat gains becomes an emit with no change to this package.
- **Cancelling.** `aparte-link-click` is cancelable: `event.preventDefault()` in `@link-click` keeps the browser from following the link, so the app can route it itself.
- **Why.** The component emitted two of the chat's events; a listener for any other fell through to its root `div` as a DOM listener under the wrong name, and heard nothing.
- **Weight.** 5.7 KB gzip, up 0.5 KB: the table of the 23 events the component listens for.
