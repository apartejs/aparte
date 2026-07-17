# @aparte/plugin-model-selector

A provider + model selector web component for [aparté](https://github.com/apartejs/aparte). Renders an
`<aparte-select>` with each registered AI provider grouped into an `<aparte-optgroup>` (a single provider
renders a flat list), for the BYOK (Bring Your Own Key) pattern.

```bash
npm install @aparte/plugin-model-selector @aparte/core
```

```ts
import '@aparte/plugin-model-selector'; // registers <aparte-model-selector>
```

```html
<aparte-model-selector auto-select persist searchable></aparte-model-selector>
```

`@aparte/core` is the only **peer dependency**. Importing the package registers the
`<aparte-model-selector>` element as a side effect.

| Attribute     | Effect                                                    |
|---------------|-----------------------------------------------------------|
| `auto-select` | Select the first available model on mount                 |
| `persist`     | Write the selection back to the resolved config           |
| `searchable`  | Enable search in the dropdown                             |
| `placeholder` | Override the placeholder text (else the active locale)    |

Fires **`aparte-model-change`** (`{ providerId, modelId, previousProviderId, previousModelId }`) when the
selection changes. It reads providers from the nearest instance config (`attachConfig`), falling back to
the global `AparteConfig`.

> ESM-only. Part of the aparté monorepo.
