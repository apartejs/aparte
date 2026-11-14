---
'@aparte/react': minor
---

`<AparteChat>` now takes a callback for every event of the chat — `onLinkClick`, `onRetry`, `onFeedback`, `onMessageDone`… — and each callback receives the event after its detail, so `event.preventDefault()` works.

```tsx
<AparteChat
  onLinkClick={(detail, event) => {
    event.preventDefault();
    navigate(detail.href);
  }}
/>
```

Do you have to touch your code? No. `onMessageSent` and `onAction` keep their names, and their first argument is still the detail: a callback written for it alone still fits.

- **Every event.** The props are generated from the events `<aparte-chat>` declares, 23 today: the composer's (`onMessageSent`, `onStop`, `onComposerChange`, `onActionClick`), the transcript's and each message's (`onPathChanged`, `onRetry`, `onEdit`, `onFeedback`, `onLinkClick`…) and the turn's (`onMessageStart`, `onMessageDone`, `onMessageError`…). A prop is the event's name without `aparte-`, in camelCase, after `on` — save `aparte-send`, which is `onMessageSent`, and `aparte-cancel`, which is `onStop`. An event the chat gains becomes a prop with no change to this package.
- **Cancelling.** `aparte-link-click` is cancelable: `event.preventDefault()` in `onLinkClick` keeps the browser from following the link, so the app can route it itself.
- **Why.** The component exposed two of the chat's events; the rest could only be reached through a DOM listener on its root, and `preventDefault()` through none of its props.
- **Weight.** 5.2 KB gzip, up 0.5 KB: the table of the 23 events the component listens for.
