---
'@aparte/angular': minor
---

On the `aparte-composer` directive, bind `(stop)` instead of `(cancel)`: `(cancel)` also caught a file input's native `cancel` event.

```html
<aparte-composer (send)="send($event)" (stop)="stopped()"></aparte-composer>
```

Do you have to touch your code? Yes, if a template binds `(cancel)` on `<aparte-composer>`: rename it to `(stop)`. Left as it is, it still compiles, because Angular reads it as a DOM listener, but it no longer runs when Stop is pressed, only when a native `cancel` bubbles out of the composer.

In an Angular template, `(x)` listens to the DOM event `x` and subscribes to the output `x`. The Stop output was named `cancel`, a DOM event that bubbles: a file input fires it when its picker closes with no file chosen, so `(cancel)` ran for the Stop button and for every such picker inside the composer. The generated directives now refuse an output named like a DOM event, the names read from TypeScript's own DOM typings, and no other output was one.

The directives' output names were not yet on [What will not change under you](https://apartejs.dev/reference/stability/), which is why this one could move without a notice release.
