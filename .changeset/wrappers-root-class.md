---
"@aparte/react": minor
"@aparte/svelte": minor
---

`<AparteChat>` accepts `className` and `style` (React) / `class` and `style` (Svelte), merged onto the root element (`[data-aparte-chat]`).

A utility-first app sizes the chat column with classes (`flex-1 min-h-0`), and the library needs a constrained height chain down to that root; without a prop the only way was a descendant selector in a stylesheet. Vue already let `class`/`style` fall through to its single root, and Angular's host element is the sized box — both are now stated in their framework pages.
