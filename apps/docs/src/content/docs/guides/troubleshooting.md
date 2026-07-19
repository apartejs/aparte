---
title: Troubleshooting
description: The real first-run failures — local-model CORS, "no provider registered", the key-exposed warning, and how vendor errors surface as AparteError.
sidebar:
  order: 11
---

The failures below are the ones that actually happen on a first run, in the order
you're likely to hit them.

## CORS on local BYOK (LM Studio / Ollama)

**This is the #1 first-run failure.** With `DirectTransport` (the default), the
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

**"Provider is not registered"** — you called `AparteConfig.registerAIProvider(...)`
with a different id than the one selected (or never called it at all). Register the
provider *and* select it before the client sends anything:

```ts
import { AparteConfig, DirectTransport, AparteClient } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';

AparteConfig.registerAIProvider(createOpenAICompatProvider(presets.OLLAMA));
AparteConfig.setModelConfig({ defaultProvider: 'ollama', defaultModel: 'llama3.2' });
AparteConfig.setTransport(new DirectTransport({ byok: true }));

new AparteClient().start();
```

**"No provider selected"** — no `defaultProvider`/`defaultModel` is set on
`AparteConfig.setModelConfig(...)` (and no `<aparte-model-selector>` has picked one yet).
Check `AparteConfig.hasSelectedModel()` — it's `false` until both are set. If you want the
composer to block sending until a model is chosen (instead of erroring on send), opt into
`AparteConfig.setRequireModelSelection(true)`.

Either way, forgetting `new AparteClient().start()` looks identical to a broken
provider from the outside: nothing streams, because nothing is listening for
`aparte-send`. See [Wire a real model](/guides/getting-started/#wire-a-real-model).

## "Key exposed" console warning

If you see:

```
[Aparte] DirectTransport is sending the "<provider>" API key straight from the browser —
it is visible to anyone who opens devtools. ...
```

`DirectTransport` just sent a real API key from the browser to the vendor, and you
didn't tell it that was intentional. It fires once per page load, the first time a key
is attached to a request.

- **Fine to ignore (or silence) when:** the key is the end-user's own (BYOK) or the
  model runs locally (LM Studio, Ollama) — pass `{ byok: true }` so the warning doesn't
  fire at all:

  ```ts
  AparteConfig.setTransport(new DirectTransport({ byok: true }));
  ```

- **Not fine when:** the key is *your* server-held vendor key. Anyone with devtools open
  can read it and use it directly. Switch to `BackendTransport` (paired with
  `createAparteChatHandler`) so the key never reaches the client — see the
  [Backend transport](/guides/backend-transport/) guide.

Keyless local providers never trigger this warning — there's no key to expose.

## Errors: `AparteError` / `AparteErrorCode`

Every failure that reaches the UI — a bad request, a rate limit, a network drop, an
unregistered provider — is normalized to an `AparteError`
(`packages/core/src/types/errors.ts`):

```ts
class AparteError extends Error {
  constructor(
    message: string,
    code: AparteErrorCode,
    data?: Record<string, unknown>,
    originalError?: unknown,
    httpStatus?: number,
  );
  static from(error: unknown, defaultCode = AparteErrorCode.UNKNOWN_ERROR, defaultStatus?: number): AparteError;
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
[`AparteConfig.setErrorRenderer`](/reference/config/#renderers--render-hooks) rather than
registering a segment renderer for `error` yourself.
