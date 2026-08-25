---
title: Model selector
description: A provider + model picker web component for aparté — a grouped dropdown for the BYOK pattern, emitting aparte-model-change.
sidebar:
  order: 5
  label: model-selector
---

A `<aparte-model-selector>` web component that lets the user pick an AI provider and model — a grouped
dropdown built on core's `<aparte-select>`, for the BYOK (Bring Your Own Key) pattern.

```bash
npm install @aparte/plugin-model-selector @aparte/core
```

`@aparte/core` is the only **peer dependency**. Importing the package registers the element as a side
effect:

```ts
import '@aparte/plugin-model-selector';
```

```html
<aparte-model-selector auto-select persist searchable></aparte-model-selector>
```

Each registered provider becomes an `<aparte-optgroup>`; a single provider renders a flat list.

| Attribute     | Effect                                                  |
| ------------- | ------------------------------------------------------- |
| `auto-select` | Select the first available model on mount               |
| `persist`     | Write the selection back to the resolved config         |
| `searchable`  | Enable search in the dropdown                           |
| `placeholder` | Override the placeholder (else the active locale string)|

It fires **`aparte-model-change`** with `{ providerId, modelId, previousProviderId, previousModelId }`.
The selector reads providers from the nearest instance config (via `attachConfig`), falling back to the
global `aparteGlobalConfig` — so multi-chat pages each drive their own model list.


## Where to put it

In the composer's bottom row — that is what the row is for, and it is one element:

```html
<aparte-composer-toolbar>
  <aparte-model-selector style="margin-inline-start: auto"></aparte-model-selector>
</aparte-composer-toolbar>
```

`margin-inline-start: auto` pushes it to the end of the row; drop it and the selector sits
at the start. In the four wrappers the same thing goes through one `toolbar` slot — see
[The composer toolbar](/guides/customization/#the-composer-toolbar).

## Typed in your framework

The element is typed by **this package**, not by the framework wrappers, through one
subpath per framework. Import it once, anywhere:

```ts
import '@aparte/plugin-model-selector/react';   // or /vue, or /svelte
```

After that the tag is checked like any other: a typo, a wrong value type, or an
wrong value type is a compile error.

```tsx
<aparte-model-selector persist="" searchable="" placeholder="Pick a model" />
```

A presence attribute is `''` to set and `null` to remove, never `false` — see
[the rule](/frameworks/elements/#the-one-thing-to-know-about-presence-attributes).
Events are typed through the DOM, because `@aparte/core` augments `HTMLElementEventMap`
with `aparte-model-change`.

Angular gets a **directive** rather than a type, because its template compiler needs a
class claiming the selector:

```ts
import { AparteModelSelectorDirective } from '@aparte/plugin-model-selector/angular';
// @Component({ imports: [AparteModelSelectorDirective], … })
```

```html
<aparte-model-selector [persist]="true" [searchable]="true" (modelChange)="use($event.modelId)" />
```

`react`, `vue`, `svelte` and `@angular/core` are all **optional** peer dependencies, so
you carry only the one you use — and the three template bindings ship no runtime at all.

:::note[Why the plugin and not the wrapper]
`@aparte/angular` shipped a directive for this element for about a day, and it was
removed: a third-party plugin's author cannot add a line to our wrapper, so typing our
own plugin there would give aparté's packages a privilege theirs could never have.

Owning the bindings where the element is owned also gives the property you actually
want, and gives it for free — install this package and the tag is typed, don't and it
isn't. The module graph enforces that; nothing has to be remembered. Your own plugin
follows the same path, with the same tools: see
[Your own element, or a plugin's](/frameworks/elements/#your-own-element-or-a-plugins).
:::

## Gating the composer until a model is picked

The model list loads asynchronously, so there's a window where the chat is mounted but no model is
selected yet. Opt in to block sending (and grey out `<aparte-composer>`) until one is:

```ts
import { aparteGlobalConfig } from '@aparte/core';

aparteGlobalConfig.setRequireModelSelection(true);
```

The composer re-enables automatically once `auto-select` (or the user) picks a model. Off by default, so
single-model or backend-driven setups that never select a model are unaffected.
