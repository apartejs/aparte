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
global `AparteConfig` — so multi-chat pages each drive their own model list.


## Gating the composer until a model is picked

The model list loads asynchronously, so there's a window where the chat is mounted but no model is
selected yet. Opt in to block sending (and grey out `<aparte-composer>`) until one is:

```ts
import { AparteConfig } from '@aparte/core';

AparteConfig.setRequireModelSelection(true);
```

The composer re-enables automatically once `auto-select` (or the user) picks a model. Off by default, so
single-model or backend-driven setups that never select a model are unaffected.
