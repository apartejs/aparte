---
title: Frameworks
description: Use aparté from React, Vue, Svelte or Angular — thin wrappers over the framework-agnostic web components, with ergonomic components plus a generic escape hatch.
sidebar:
  order: 1
  label: Overview
---

`@aparte/core` is vanilla web components, so it already works in **any** framework. The framework
packages add ergonomics on top — you don't have to hand-wire refs, events and lifecycle yourself.

Each wrapper ships **two layers**:

- **An opinionated component** — e.g. React's `<AparteChat>`: the full chat surface (viewport +
  composer + slots) as one idiomatic component, plus hooks/stores/services for state and the client.
- **A generic escape hatch** — e.g. React's `<AparteUi name="aparte-…" />`: mounts **any**
  custom element as a framework component (props + events forwarded), so you're never
  boxed in by the opinionated component. It takes a tag name, not a registry lookup, so an
  element from a [plugin](/plugins/) — or one of your own — works the same way; whatever
  defines the element has to be imported, and until it is the tag mounts empty and inert.

The wrappers depend **only** on `@aparte/core` — never on a specific provider. You register a
provider (or none) in the [config](/providers/); the wrapper streams whatever's configured. See
[Providers](/providers/) for the model side.

## Available

- **[React](/frameworks/react/)** — `@aparte/react` (React 18/19).
- **[Vue](/frameworks/vue/)** — `@aparte/vue` (Vue 3.5+).
- **[Svelte](/frameworks/svelte/)** — `@aparte/svelte` (Svelte 4).
- **[Angular](/frameworks/angular/)** — `@aparte/angular` (Angular 19, standalone).

All four expose the **same slots** — that is checked mechanically, not promised — each in
its own idiom. The table of every slot with its four syntaxes side by side is generated from
the wrapper source: [Wrapper slots](/reference/wrappers/).
