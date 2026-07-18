# playground · angular

A minimal Angular example: `@aparte/angular`'s `<aparte-chat>` driving a **real** model, plus the
`model-selector` and `marked` plugins.

```bash
pnpm --filter @aparte-workspace/playground-angular dev
```

`provideAparte({ providers, plugins, clientOptions })` ([`src/main.ts`](./src/main.ts)) registers
everything **and auto-connects the client** — `AppComponent`
([`src/app/app.component.ts`](./src/app/app.component.ts)) just renders `<aparte-chat>`, no manual
`AparteAiService.connect()`. Mounting it in a real Angular app also exercises core's
`framework-managed` shell guard.

Built with the Angular CLI (`ng build` / `ng serve`) and consumes `@aparte/angular` from its published APF
`dist`, like a real consumer. Because of that, the CLI's dependency prebundle can outlive a wrapper
rebuild (the package version doesn't change) — if a fresh `@aparte/*` build doesn't show up, delete
`.angular/` and restart the dev server.

## Talking to a model (BYOK / local)

Pick a provider in the selector: **Ollama** / **LM Studio** run locally with **no key** (enable CORS on the
local server); **OpenRouter** uses a key you paste in the top bar (stored in `localStorage` only). Never
commit a key.
