---
'@aparte/core': minor
'@aparte/angular': minor
---

**A wrapper types only what it depends on.** `AparteModelSelectorDirective` and `AparteAskUserDirective` are removed from `@aparte/angular`; `aparte-model-selector` and `aparte-ask-user` are removed from core's `AparteElementAttributes` registry, along with the `AparteModelSelectorAttributes` export; and `aparte-model-change` is removed from `APARTE_DEFAULT_UI_EVENTS`.

They were added hours earlier in the same release, and the reason to take them back out is the one that matters: **a third-party plugin's author cannot add a line to `@aparte/core`.** Typing our own plugin's element from core and shipping its directive from the wrapper gave aparté's packages a privilege nobody else's plugin could have — an asymmetry baked into the library before it has an ecosystem.

The rule that replaces it is symmetric and states in one line: **whoever owns the element owns its contract and its bindings.** Core's elements are typed by core and wrapped by the wrappers. Everything else — a plugin's element, ours or yours — is typed by its owner, or in six lines by the app that places it. Both mechanisms are documented, and both are exactly the same work for us as for anyone: module augmentation for React/Vue/Svelte (types only, no runtime, applies exactly when the package is installed) and a directive for Angular, whose only non-obvious part — attribute versus property — is `applyElementProps`, already exported.

Nothing about core's own 18 elements changes: their attributes, the 26 declared events with 20 typed details, the JSX/Vue/Svelte typing and the 17 Angular directives all stay.

The Angular example now declares its own six-line directive for the model selector instead of importing one, which makes it a worked demonstration of the pattern rather than a consumer of a privilege — and it keeps its `CUSTOM_ELEMENTS_SCHEMA` removed.
