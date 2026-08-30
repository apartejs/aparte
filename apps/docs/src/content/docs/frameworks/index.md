---
title: 'AI Chat Components for React, Vue, Svelte & Angular'
description: Use aparté from React, Vue, Svelte or Angular — thin wrappers over the framework-agnostic web components, with ergonomic components plus a generic escape hatch.
sidebar:
  order: 1
  label: Overview
---

`@aparte/core` is vanilla web components, so it already works in **any** framework. The framework
packages add ergonomics on top — you don't have to hand-wire refs, events and lifecycle yourself.

Each wrapper ships **three layers**:

- **An opinionated component** — e.g. React's `<AparteChat>`: the full chat surface (viewport +
  composer + slots) as one idiomatic component, plus hooks/stores/services for state and the client.
- **A typed surface for every element** — see [Placing elements, typed](/frameworks/elements/).
  Real attributes and real events on the real tag, checked by your compiler: JSX intrinsics in
  React, `GlobalComponents` in Vue, `SvelteHTMLElements` in Svelte, a standalone directive per
  element in Angular. This is how you place a model selector, a conversation list, or a composer
  you compose yourself.
- **A generic escape hatch** — e.g. React's `<AparteUi name="my-widget" />`: mounts **any**
  custom element as a framework component (props + events forwarded). It takes a tag name, not a
  registry lookup, so an element of your own or a third party's works the same way; whatever
  defines the element has to be imported, and until it is the tag mounts empty and inert. For
  aparté's own elements, reach for the typed surface instead.

The wrappers depend **only** on `@aparte/core` — never on a specific provider. You register a
provider (or none) in the [config](/providers/); the wrapper streams whatever's configured. See
[Providers](/providers/) for the model side.

## React, Vue, Svelte and Angular chat components

- **[React chat component](/frameworks/react/)** — `@aparte/react` (React 18/19).
- **[Vue chat component](/frameworks/vue/)** — `@aparte/vue` (Vue 3.5+).
- **[Svelte chat component](/frameworks/svelte/)** — `@aparte/svelte` (Svelte 4 and 5).
- **[Angular chat component](/frameworks/angular/)** — `@aparte/angular` (Angular 19, standalone).

All four expose the **same slots and the same six callbacks** — `messageSent`, `action`,
`messagesChange`, `messageAppended`, `typingChange`, `conversationCreated` — each in its own
idiom, and that is checked mechanically rather than promised. Both tables, with the four
syntaxes side by side, are generated from the wrapper source:
[Wrapper surface](/reference/wrappers/).
