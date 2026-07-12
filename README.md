# aparte

> **🚧 Pre-alpha — under construction.** The public API is unstable and nothing is published to
> npm yet. This repo is being migrated package-by-package from a private monorepo; watch the
> milestones below.

**aparte** (`@aparte`, pronounced *"ah-par-té"*) is a **framework-agnostic AI-chat library**:
vanilla Web Components at the core, thin framework wrappers on top, and opt-in providers and
plugins. It talks to any LLM through a **transport** — `DirectTransport` (browser-direct,
bring-your-own-key or local) or `BackendTransport` (your `/api/chat`, key stays server-side).

*A library, not an app.* The privacy-first, in-browser assistant that consumes aparte lives in
its own repo. aparte itself is backend-agnostic and makes no local-first promise.

## Packages (planned)

| Package | What |
|---|---|
| `@aparte/core` | Vanilla TS web components — **zero dependencies** |
| `@aparte/engine` | Framework-agnostic agent loop (`runStreamAgent`) |
| `@aparte/react` · `/vue` · `/svelte` · `/angular` | Thin framework wrappers |
| `@aparte/provider-*` | LLM adapters (openai-compat, ai-sdk, transformers) |
| `@aparte/plugin-*` | Blessed opt-in plugins (icons, markdown, highlight, …) |
| `@aparte/locale-*` | UI string bundles (en, fr) |

## Development

```bash
pnpm install          # bootstrap
pnpm build            # build all packages
pnpm test             # run the test suite
pnpm lint             # lint
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for conventions and the gate each change lands behind.

## Milestones

- **M0** — repo bootstrap (this) ✅ in progress
- **M1** — `core` · M2 — `engine` · M3 — providers · M4 — wrappers · M5 — plugins + locales
- **M6** — playgrounds · M7 — first `0.0.x` alpha on npm

## License

[MIT](./LICENSE) © Paul Richez
