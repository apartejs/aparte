---
'@aparte/core': minor
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
'@aparte/plugin-approval': minor
'@aparte/plugin-artifacts': minor
'@aparte/plugin-ask-user': minor
'@aparte/plugin-diff': minor
'@aparte/plugin-model-selector': minor
'@aparte/plugin-subagents': minor
'@aparte/plugin-triggers': minor
---

A plugin's element can now be used from React as a typed component: `createAparteElement(approvalModeElement)` from `@aparte/react`. Each plugin exports a spec for its element (`approvalModeElement`, `modelSelectorElement`, `triggersElement`, `diffElement`, `subagentViewElement`, `askUserElement`, and `artifactPanelElement` from `@aparte/plugin-artifacts/panel`), and Vue and Svelte type the tag from it with `AparteVueElement<typeof spec>` and `AparteSvelteElement<typeof spec>`.

```tsx
const ApprovalMode = createAparteElement(approvalModeElement);
<ApprovalMode labels={{ ask: 'Ask first' }} onApprovalModeChange={(detail) => save(detail.mode)} />
```

The spec is core's new `AparteElementSpec` type — the tag, its attributes, the members it has only as a property, its events with the name each binds under, and what it reads at connect — with phantom generics, so the attribute, property and event types travel with the value (`AparteSpecAttributes`, `AparteSpecProperties`, `AparteSpecEvents` read them back). It is data and defines nothing. A plugin generates its specs from its manifest; a third party writes one literal and every wrapper binds it the same way, since a plugin can depend on core but never on a wrapper. In Angular, a plugin's element takes `CUSTOM_ELEMENTS_SCHEMA`, as any custom element does.

Deprecated: `@aparte/plugin-model-selector/react`, `/vue`, `/svelte` and `/angular`. They keep working until the next major; use `modelSelectorElement` the same way as any other plugin's spec.
