---
'@aparte/plugin-model-selector': minor
---

**`@aparte/plugin-model-selector/angular`** — the fourth and last binding, so all four frameworks now get `<aparte-model-selector>` from the package that owns it.

```ts
import { AparteModelSelectorDirective } from '@aparte/plugin-model-selector/angular';
// @Component({ imports: [AparteModelSelectorDirective], … })
```

Angular is the only one of the four that needs real code — its template compiler requires a class claiming the selector, and `[persist]="true"` on a custom element writes a *property*, which on an attribute-driven element is a silent no-op. So this entry is compiled in **partial-Ivy** mode by `ngc`, the format a consumer's own AOT build finishes, while Vite keeps building everything else. The directive itself is generated from the package's own custom-elements manifest, like the other three bindings.

`@angular/core` is an **optional** peer dependency: install the plugin without Angular and nothing here is reachable, which is the point.

The Angular example now imports this instead of the six-line local directive it wrote while waiting — the import resolving at all *is* the property, since you get the binding exactly when you have the plugin. That local directive remains the documented path for an element aparté does not define.
