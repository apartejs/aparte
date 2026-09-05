---
"@aparte/react": minor
"@aparte/vue": minor
"@aparte/svelte": minor
"@aparte/angular": minor
"@aparte/core": patch
---

The four wrappers show a conversation on its way: a `loading` prop (an input in Angular) draws two skeleton turns in the transcript, keeps the empty state off and disables the composer until the messages land — and the conversation controller sets it by itself while it fetches through your adapter's `loadFull()`. Nothing to change unless you want a wait of your own: pass `loading`.

Core's host binding gained `onLoadingChange?(on)`: the controller's wait, forwarded beside the viewport's `loading` attribute, so a wrapper that renders its own DOM can draw it. Under `framework-managed` the viewport itself draws no skeleton any more (a `<div>` prepended into a host React reconciles is one React did not render); it still sets the attribute and `aria-busy`. And the viewport's status line for a screen reader is now a sibling of the skeleton, not a child of it — inside an `aria-hidden` box it was hidden too.
