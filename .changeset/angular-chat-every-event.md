---
'@aparte/angular': minor
---

`<aparte-chat>` now has an output for every event of the chat — `(linkClick)`, `(retry)`, `(feedback)`, `(messageDone)`… — each emitting the event's detail; to cancel one, bind the DOM event itself on the same tag, `(aparte-link-click)`.

```html
<aparte-chat (linkClick)="open($event.href)" (aparte-link-click)="$event.preventDefault()"></aparte-chat>
```

Do you have to touch your code? No. `(messageSent)` and `(action)` keep their names and their payload.

- **Every event.** The outputs come from a base class generated from the events `<aparte-chat>` declares, 23 today: the composer's (`messageSent`, `stop`, `composerChange`, `actionClick`), the transcript's and each message's (`pathChanged`, `retry`, `edit`, `feedback`, `linkClick`…) and the turn's (`messageStart`, `messageDone`, `messageError`…). An output is the event's name without `aparte-`, in camelCase — save `aparte-send`, which is `messageSent`, and `aparte-cancel`, which is `stop`, since `cancel` is a DOM event and `(cancel)` would also catch every native one. An event the chat gains becomes an output with no change to this package.
- **Cancelling.** The component's host IS `<aparte-chat>`, so `(aparte-link-click)` on it binds the DOM event, and `$event.preventDefault()` keeps the browser from following the link. Both bindings run once per click.
- **Change detection.** The listeners sit outside the zone, and an event enters it only for an output a template binds: `aparte-segment-update` comes once per streamed token and costs nothing unless you listen to it. Measured on the Angular example, a streamed chunk is on screen at a p95 of 17.9 to 19.4 ms over three runs, against 17.5 ms before the change, under a 50 ms budget.
- **Why.** The component had two of the chat's events as outputs.
- **Weight.** 34.1 KB gzip, up 2.5 KB: the 23 outputs and the listener that feeds them.
