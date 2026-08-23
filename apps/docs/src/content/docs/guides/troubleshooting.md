---
title: Troubleshooting
description: The real first-run failures — local-model CORS, "no provider registered", the key-exposed warning, and how vendor errors surface as AparteError.
sidebar:
  order: 11
---

The failures below are the ones that actually happen on a first run, in the order
you're likely to hit them.

## `Failed to resolve module specifier "@aparte/core"`

You opened an `index.html` directly, with no bundler. A browser cannot resolve a
bare specifier on its own — that is a build-tool convention, not a web one.

Two ways out:

- **Use a bundler.** Vite, Next, Astro, Parcel, esbuild — any of them resolve it.
  This is what every snippet in these guides assumes, and what the examples do.
- **Declare the mapping yourself** with an import map, and load the CSS by URL:

```html
<script type="importmap">
  { "imports": { "@aparte/core": "https://esm.sh/@aparte/core@latest" } }
</script>
<link rel="stylesheet" href="https://esm.sh/@aparte/core@latest/styles.css" />
```

"Framework-agnostic" means no React/Vue/Svelte/Angular. It does not mean no build
step — and this page exists to say the first thing you actually hit, so it says it.

## CORS on local BYOK (LM Studio / Ollama)

**This is the #1 first-run failure.** With `AparteDirectTransport` (the default), the
*browser itself* calls `http://localhost:1234` (LM Studio) or `http://localhost:11434`
(Ollama) directly — there is no server in between to add CORS headers for you. If the
local server doesn't send permissive CORS headers, the browser blocks the response and
the request fails with a network/CORS error, even though the server logs show it
received the request.

The two local presets live in `packages/providers/ai/openai-compat/src/presets.ts` as
`presets.LMSTUDIO` (`http://localhost:1234/v1`) and `presets.OLLAMA`
(`http://localhost:11434/v1`) — see the [OpenAI-compatible provider](/providers/ai/openai-compat/)
guide for how to register them.

**Fix — LM Studio:** open the LM Studio server settings (Developer tab) and enable
**"Enable CORS"** on the local server, then restart the server.

**Fix — Ollama:** start it with the `OLLAMA_ORIGINS` environment variable set to allow
your page's origin (or `*` for local development):

```bash
OLLAMA_ORIGINS=* ollama serve
```

On Windows (PowerShell), set it before launching:

```powershell
$env:OLLAMA_ORIGINS = "*"
ollama serve
```

Without this, Ollama only accepts requests from a small built-in allowlist of origins
and rejects everything else with a CORS error.

## "No provider registered" / no model available

Two different symptoms, one root cause: nothing is wired up yet.

**"Provider is not registered"** — you called `aparteGlobalConfig.registerAIProvider(...)`
with a different id than the one selected (or never called it at all). Register the
provider *and* select it before the client sends anything:

```ts
import { aparteGlobalConfig, AparteDirectTransport, AparteClient } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';

aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.OLLAMA));
aparteGlobalConfig.setModelConfig({ defaultProvider: 'ollama', defaultModel: 'llama3.2' });
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));

new AparteClient().start();
```

**"No provider selected"** — no `defaultProvider`/`defaultModel` is set on
`aparteGlobalConfig.setModelConfig(...)` (and no `<aparte-model-selector>` has picked one yet).
Check `aparteGlobalConfig.hasSelectedModel()` — it's `false` until both are set. If you want the
composer to block sending until a model is chosen (instead of erroring on send), opt into
`aparteGlobalConfig.setRequireModelSelection(true)`.

Either way, forgetting `new AparteClient().start()` looks identical to a broken
provider from the outside: nothing streams, because nothing is listening for
`aparte-send`. See [Wire a real model](/guides/getting-started/#wire-a-real-model).

## "Key exposed" console warning

If you see:

```
[Aparte] AparteDirectTransport is sending the "<provider>" API key straight from the browser —
it is visible to anyone who opens devtools. ...
```

`AparteDirectTransport` just sent a real API key from the browser to the vendor, and you
didn't tell it that was intentional. It fires once per page load, the first time a key
is attached to a request.

- **Fine to ignore (or silence) when:** the key is the end-user's own (BYOK) or the
  model runs locally (LM Studio, Ollama) — pass `{ byok: true }` so the warning doesn't
  fire at all:

  ```ts
  aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
  ```

- **Not fine when:** the key is *your* server-held vendor key. Anyone with devtools open
  can read it and use it directly. Switch to `AparteBackendTransport` (paired with
  `createAparteChatHandler`) so the key never reaches the client — see the
  [Backend transport](/guides/backend-transport/) guide.

Keyless local providers never trigger this warning — there's no key to expose.

## `[Unknown segment type: …]` in the bubbles

The bubble found no renderer for that segment type.

- **A built-in type** (`text`, `thinking`, `code`, `terminal`, `tool_call`, `artifact`,
  …) should never show this: core installs its built-in renderers the first time a
  segment needs one. If you see it anyway, something declined them — a
  `new AparteClient({ autoRegister: false })` somewhere, which is remembered on
  purpose. Drop the option, or register what you need with `registerSegmentRenderer`.
  On **0.4.x and earlier** the built-ins only came with `new AparteClient()`, so a
  display-only app had to call `registerDefaultRenderers()` itself — that's the fix
  there.
- **Your own type** — that's the expected fallback: register a renderer for it (see
  [Custom segment types](/guides/customization/#custom-segment-types)).

The symptom is easy to misread, because everything else works: bubbles, streaming,
auto-scroll, the composer. Only the content is missing.

## The retry / edit / ⓘ buttons aren't there

They ship **off**. Core can only render them; re-sending a message, keeping edited text and
opening a stats popover all need someone outside core, so aparté waits for you to say you're
there rather than showing a button that answers to nobody:

```ts
aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });   // you run an AparteClient
aparteGlobalConfig.setBubbleActions({ feedback: true, info: true }); // you handle these events
```

Same for the three affordances outside the action bar — the clickable image tile, the `Run`
button on a terminal segment, the download button on a **binary** artifact:

```ts
aparteGlobalConfig.setHostHandlers({ attachmentPreview: true, terminalRun: true, artifactRedownload: true });
```

Two things that are *not* the cause, before you go looking:

- **The bar hides itself while a reply streams** (and reappears when the turn ends) — by
  design, so copy/retry never sit on an empty bubble.
- **An action bar with nothing in it isn't rendered at all**, so if you disabled every action
  the whole row is gone rather than blank.

Coming from 0.4.x and the buttons vanished? That's this change — one line brings them back.
The full table of what ships enabled and why is in
[Customization](/guides/customization/#what-ships-enabled).

## The composer toolbar isn't showing

Three causes, in the order they happen.

**You are passing `footerLeft` / `footerCenter` / `footerRight`.** They were removed: the
three positional slots became one `toolbar`. In React that is a type error; in Vue, Svelte
and Angular an unknown slot name renders **nothing, silently**, which is why this entry
exists. Pass one `toolbar` and order your controls yourself — see
[The composer toolbar](/guides/customization/#the-composer-toolbar).

**The row is empty.** `<aparte-composer-toolbar>` reflects `data-empty` while it holds no
content, and the stylesheet hides it then — an empty row must not draw its separator. Text
counts as content, so a bare token count is fine; whitespace and comments do not. If you
expected something in it and see nothing, inspect the element: `data-empty` present means
your content never arrived (a mistyped slot name, or a framework that rendered nothing).

**The row is there but unstyled, and your control sits at the start.** Then the stylesheet
did not reach the page: an undefined-looking custom element falls back to `display: inline`,
so there is no flex container and `margin-inline-start: auto` does nothing. Check that you
import `@aparte/core/styles.css`, and — if you work in this repo — that
`packages/core/dist/index.css` is current: it is a build output, so a stale one can be
served after a build that reported success.

## Errors: `AparteError` / `AparteErrorCode`

Every failure that reaches the UI — a bad request, a rate limit, a network drop, an
unregistered provider — is normalized to an `AparteError`
(`packages/core/src/types/errors.ts`):

```ts
declare class AparteError extends Error {
  constructor(
    message: string,
    code: AparteErrorCode,
    data?: Record<string, unknown>,
    originalError?: unknown,
    httpStatus?: number,
  );
  // `defaultCode` defaults to AparteErrorCode.UNKNOWN_ERROR.
  static from(error: unknown, defaultCode?: AparteErrorCode, defaultStatus?: number): AparteError;
}
```

`AparteErrorCode` is a flat enum grouped by who's responsible:

| Code | Meaning |
|---|---|
| `CONFIG_NO_PROVIDER` | No provider selected. |
| `CONFIG_MISSING_KEY` | The selected provider isn't registered (or its key is missing). |
| `CONFIG_INVALID_MODEL` | The selected model id isn't valid for the provider. |
| `USAGE_RATE_LIMIT` | Vendor rate limit (HTTP 429). |
| `USAGE_CONTEXT_EXCEEDED` | Context window exceeded (HTTP 400). |
| `USAGE_BAD_REQUEST` | Malformed request (HTTP 400). |
| `NET_OFFLINE` | The client is offline. |
| `NET_TIMEOUT` | The request timed out. |
| `NET_ERROR` | Generic network failure. |
| `PROVIDER_ERROR` | Vendor-side error (HTTP 5xx). |
| `PROVIDER_UNAVAILABLE` | Vendor service unavailable (HTTP 503). |
| `PROVIDER_POLICY` | Rejected by the vendor's moderation/policy. |
| `UNKNOWN_ERROR` | Anything uncategorized — `AparteError.from`'s default. |

**How it surfaces:** `AparteClient` catches whatever the transport/provider throws, wraps
it with `AparteError.from(error, AparteErrorCode.UNKNOWN_ERROR)` (vendor errors don't
already arrive pre-classified, so most surface as `UNKNOWN_ERROR` unless a provider adapter
throws a more specific one), renders it as the message's `error` segment
(`content` = `error.message`, `details` = `error.code`), and dispatches an
`aparte-message-error` `CustomEvent` on the target element with
`{ messageId, error }` — `error` is the full `AparteError`, so `error.code`,
`error.data`, `error.httpStatus` and `error.originalError` are all available to a listener:

```ts
document.querySelector('aparte-chat')?.addEventListener('aparte-message-error', (e) => {
  const { error } = (e as CustomEvent).detail;
  console.error(error.code, error.message);
});
```

Customize what the error segment looks like with
[`aparteGlobalConfig.setErrorRenderer`](/reference/config/#renderers--render-hooks) rather than
registering a segment renderer for `error` yourself.
