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
