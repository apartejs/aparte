# demo · vanilla

Proof that **`@aparte/core` is self-contained** — a plain Vite app, no framework, no AI model, that resolves
`@aparte/core` through its published `exports` map (**`dist`**, not the monorepo source) exactly like an
external consumer. It also shows the built-in **human-in-the-loop tool approval**: type "delete" and the
assistant surfaces a `tool_call` segment as the anchor while the decision is asked in the composer,
through the real `requestUserInput` contract.

```bash
pnpm --filter @aparte-workspace/example-vanilla-dist dev
```

Distinct from `example-vanilla`: that one wires a real BYOK / local model from source; this one is the
minimal published-package integrity check (dist) with a keyless echo + the approval gate.
