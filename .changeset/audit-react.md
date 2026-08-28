---
"@aparte/react": patch
---

An uncontrolled `<AparteChat>` (no `messages` prop) no longer wipes its own thread on every render and loops — the omitted-prop default was a fresh array each render, and the parent-push effect compared by identity. The published build now carries `'use client'` (Rollup dropped the source directive when it merged the module), so the documented Next App Router path works on import. `useConversationManager().init(adapter, config?)` is typed with the `config` its JSDoc told you to pass.
