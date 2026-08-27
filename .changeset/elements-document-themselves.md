---
'@aparte/core': minor
'@aparte/plugin-ask-user': minor
---

Every element now carries its own documentation, and the docs site is generated from it.

`package.json` points `customElements` at `dist/custom-elements.json` and `files` ships `dist`,
so this file is what feeds a consumer's editor autocomplete — not only apartejs.dev. It was
thin, wrong in five places, and in one package it did not exist at all.

## The manifest, measured across core's 18 elements

| | before | after |
| --- | --- | --- |
| descriptions under 200 characters | 10 / 18 | **0 / 18** |
| elements declaring their CSS variables | 0 / 18 | **17 / 18** |
| declared slots | 1 | **0** |
| elements carrying a worked example | 18 / 18 | 18 / 18 |

**The CSS variables are the substantial half.** 263 exist and not one was attached to the
element it styles, so they were reachable only through a single flat 263-row reference — present
and unfindable, which is the failure this repo keeps rediscovering. **177 are now declared on
their own element**, with the default the stylesheet actually sets. The eighteenth, the composer
toolbar, correctly declares none: it is styled entirely by global spacing tokens and has no knob
of its own.

**The slot count going to zero is the fix, not a regression.** Core has no shadow DOM — no
`attachShadow`, no `<slot>` element anywhere — so it has no slots. A `@slot` in a manifest
declares a real slot NAME a consumer can write and tooling will offer; one had shipped for a
`panel` region that is a plain child stamped `data-aparte-panel`, so an editor would have
completed a name that does nothing. Ratified decision #4: a name a context contradicts is a name
that will lie. What an element accepts as children, and where those children land, is now prose.

## Five published claims were false, and are corrected rather than softened

- `<aparte-chat-viewport>`'s `framework-managed` said it "relocates none of its children". It
  re-appends core's own scroll-to-bottom button whenever that stops being last, and that path
  runs in framework-managed mode only. The guarantee is about the nodes the FRAMEWORK renders.
- `<aparte-chat>` described its composition test as looking for a viewport CHILD. It is a
  descendant query, so a viewport nested inside a wrapper of your own counts — and the
  difference decides whether your markup survives or is overwritten by the default composition.
  Only the centering CSS is direct-child, and only that sentence now says so.
- `<aparte-chat>` said "a framework wrapper sets `framework-managed`". Only Angular's does: its
  component selector IS `aparte-chat`, while React, Vue and Svelte render a `[data-aparte-chat]`
  div and never create the element.
- `--aparte-viewport-padding` promised that a narrow container reduces it. That rule targets a
  wrapper the framework-managed path never builds — and it cannot be repaired by adding the
  host, because `container-type` is declared on the viewport itself and a container query never
  matches its own container.
- `<aparte-composer>`'s `--aparte-message-max-width` said overriding it "moves both". Custom
  properties inherit downward and `.aparte-message` is a sibling subtree, so set on the composer
  it moves only the composer.

Each was found by an adversarial pass that was told to refute, not to confirm.

## `@aparte/plugin-ask-user` ships a manifest for the first time

It defines a custom element with `customElements.define` and shipped nothing machine-readable
about it: no `customElements` field, no `analyze` step, no manifest — while its sibling
`@aparte/plugin-model-selector` has had all three since it shipped. So no editor completed
`<aparte-ask-user>`'s surface, and no page could be generated from it. It has one now.

The analyzer plugin that lifts `@example` blocks into a manifest lived inline in core's config,
so neither plugin element had an example in its own manifest. It is now shared by all three
configs, and all three report every element carrying one.

## Why minor rather than patch

Nothing's runtime behaviour changed in this entry, but the manifest is a PUBLISHED description
of the API: a declared slot disappears, 177 CSS custom properties appear, and a package gains a
`customElements` pointer where it had none. Tooling reads all of that. Calling metadata that
consumers' editors consume a patch would understate it.
