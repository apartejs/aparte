---
title: Support matrix
description: Which browsers, Node versions, frameworks, bundlers and TypeScript settings @aparte/* supports — each floor derived from what the code uses, and the versions CI actually runs.
sidebar:
  order: 8
---

Every `@aparte/*` package ships at one version, so there is one matrix. Each row gives two
numbers, because they answer different questions. The **floor** is derived from what the
code uses — the newest CSS or JS feature it relies on with no fallback — so a break at or
above it is a bug you can report. The **tested** version is what CI runs on every push,
and is therefore the only one we have *seen* work. Nothing in between is run: the floor is
a promise read off the feature list, not off a browser farm.

Measured on 0.15.1, August 2026. Before 1.0 a floor can move in a minor; the changelog
says so when one does.

## Browsers

| Engine | Floor | What sets it | Tested in CI |
| --- | --- | --- | --- |
| Chrome, Edge | **111** (March 2023) | `color-mix()`, `oklch()` | Chromium 149 |
| Safari, iOS Safari | **16.2** (December 2022) | `color-mix()` | WebKit 26.5 |
| Firefox | **121** (December 2023) | `:has()` | Firefox 151 |
| Samsung Internet | **22** | `oklch()` | — |

The tested builds are the ones Playwright 1.61.1 pins. `pnpm e2e` drives the example apps
through them — every app on Chromium, five on WebKit, two on Firefox (smoke and the axe
audit); the split and the reason for it are in the
[accessibility guide](/guides/accessibility/).

### What each floor rests on

- **`color-mix()`** — Chrome 111, Safari 16.2, Firefox 113. The soft buttons, the alerts
  and badges, the mark's tint, the focus ring, the success and error surfaces. Without it
  the declaration is dropped: the chat works, those tints are missing.
- **`oklch()`** — Chrome 111, Safari 15, Firefox 113. The two theme surfaces mixed in
  that space; same failure shape as above.
- **`:has()`** — Chrome 105, Safari 15.4, Firefox 121. The mark on a checked choice row,
  the invalid border on a field group, and the **focus ring on a choice row** — a keyboard
  user's only sign of where they are, which is why it sets a floor rather than counting
  as a nicety.
- **ES2022** — the JavaScript is emitted as ES2022 and not transpiled below it. The
  platform APIs it needs — Custom Elements v1, `MutationObserver`, `ResizeObserver`,
  `ReadableStream`, `AbortSignal.timeout()` (Safari 16) — are all older than the CSS
  floors above.

### What degrades on purpose

- **Relative colour syntax** (`oklch(from …)`) derives the ink on a fill, so a solid
  button stays readable on whatever brand colour you set. It sits under `@supports`: a
  browser without it (Chrome before 119, Safari before 16.4, Firefox before 128) gets the
  fixed `--aparte-on-intent` fallback — readable on the default palette, not recomputed
  for yours. See [the ink on a fill](/guides/theming/#rebrand-in-a-handful-of-variables).
- **`@container`** narrows the message padding below 520px. Without it (Chrome before
  106, Safari before 16, Firefox before 110) the wide defaults stay.
- **`content-visibility`** is a rendering hint and is ignored where unsupported.

### No secure context required

Two browser APIs exist only on `https://` and `localhost`: `crypto.randomUUID` and
`navigator.clipboard`. Core reaches both through a fallback — `uuid()` and `copyText()`,
both exported — because `http://192.168.1.x` with a local model on the LAN box is the
deployment this library was written for. The copy buttons use `execCommand('copy')`
there; ids come from a cheap non-cryptographic generator. `pnpm check:secure-context`
keeps every call site on the fallback. Both functions are listed in
[the pieces core exports](/guides/bring-your-own-loop/#the-pieces-core-exports-for-this).

## Node

| | Floor | Tested in CI |
| --- | --- | --- |
| Node.js | **18** (`engines.node`) | 18 and 24 |

What runs in Node is the `node` export condition of `@aparte/core` — types, the parsers,
`AparteClient` and the transports — which registers no element and touches no DOM at
import, so a server-rendered page can import the package safely; `@aparte/engine` is
headless throughout. On 18, CI builds every package, runs the unit suite and enumerates
that Node entry (`check:node-import`); on 24 it runs the full gate. `Request`,
`ReadableStream` and `structuredClone` are not the same surface on the two, which is why
both run rather than one.

A test runner is Node too, so it takes that same `node` condition and no `<aparte-*>`
element upgrades under jsdom — point it at
[`@aparte/core/browser`](/frameworks/elements/#testing-your-components) instead.

## Frameworks

| Wrapper | Peer range | Tested with |
| --- | --- | --- |
| [`@aparte/react`](/frameworks/react/) | React 18 or 19 | typechecked against both; the example runs 19 |
| [`@aparte/vue`](/frameworks/vue/) | Vue 3.5+ | 3.5 |
| [`@aparte/svelte`](/frameworks/svelte/) | Svelte 4 or 5 | one example each, both in the browser suite |
| [`@aparte/angular`](/frameworks/angular/) | Angular 19.2+ | 19.2 |

Each wrapper declares `@aparte/core` as a peer at the release it shipped with
(`>=0.15.1 <1.0.0` today): install both from the same release.
[`@aparte/plugin-model-selector`](/plugins/model-selector/) carries the same four peers,
all optional.

## Bundlers and TypeScript

**ESM only** — no CommonJS build, no UMD. Every package ships an `exports` map and a
`sideEffects` field that names the CSS and the element registrations, so a bundler keeps
`customElements.define` and drops what you do not import. That is checked on every gate
with `publint` and `@arethetypeswrong/cli` on its `esm-only` profile, which also names
what is *not* supported: `require()` of a package, and TypeScript's
`moduleResolution: "node"`. Use `bundler`, `node16` or `nodenext`.

Vite, webpack 5, Rollup, esbuild and Parcel 2 all read that map. Without a bundler, the
packages load as ES modules from a CDN — the vanilla path in
[getting started](/guides/getting-started/). The `.d.ts` files are emitted by TypeScript
5.7; the examples compile them from 5.4 up.

## What "supported" means

At or above a floor, a break is a bug: [open an issue](https://github.com/apartejs/aparte/issues)
with the engine and its version. Below it, the library is not tested and not fixed — but a
fallback under `@supports` that costs nothing above the floor is welcome as a pull request.
A floor is not raised for a nicety, and not lowered for a version nobody measured.
