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

## Gating the composer until a model is picked

The model list loads asynchronously, so there's a window where the chat is mounted but no model is
selected yet. Opt in to block sending (and grey out `<aparte-composer>`) until one is:

```ts
import { aparteGlobalConfig } from '@aparte/core';

aparteGlobalConfig.setRequireModelSelection(true);
```

The composer re-enables automatically once `auto-select` (or the user) picks a model. Off by default, so
single-model or backend-driven setups that never select a model are unaffected.
