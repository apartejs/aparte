---
title: Scenario provider — a scripted model for demos and tests
description: Replay scripted turns — markdown at a typing pace, thinking, tool calls, errors — with no key and no network. A deterministic model for a demo page, the docs, and your own tests.
sidebar:
  label: Scenario (scripted)
---

`@aparte/provider-scenario` is an AI provider that never calls a model: it **replays turns
you wrote**. Text streams at a typing pace, a thinking block appears, a tool is called and
the real loop runs your handler, an error fails the turn — the whole UI behaves as it
would with a model, and behaves the same every time.

Two reasons to want that. A **demo** — a landing page, a docs frame, a storybook — that
streams something real without a backend or a key. And **your tests**: a chat wired to
this provider is deterministic end to end, which is what a test of your own app around
aparté needs and what a network mock cannot give you as simply.

```bash
npm install @aparte/provider-scenario @aparte/core
```

`@aparte/core` is the only peer dependency; the package has none of its own.

## Turns, in order

```ts
import { aparteGlobalConfig, AparteClient, AparteDirectTransport } from '@aparte/core';
import { createScenarioProvider } from '@aparte/provider-scenario';

aparteGlobalConfig.registerAIProvider(createScenarioProvider({
  turns: [
    'Hello! Ask me anything.',
    [{ thinking: 'Let me see…' }, { text: 'Here is my **answer**, with *markdown*.' }],
  ],
}));
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
new AparteClient().start();
```

`turns` answers the model's calls in order and repeats the last one. Every call
advances — a retry, and the second half of a tool round-trip, included. It is the form
for a demo that always goes the same way, or a test that needs exactly three replies.

A turn is a string (one text step) or a list of steps:

| Step | What it does |
|---|---|
| `{ text }` | Streams the text, chunk by chunk. Markdown and `<artifact>` tags are parsed by core as usual. |
| `{ thinking }` | Streams reasoning — the thinking block. |
| `{ tool, input?, id? }` | Calls the tool of that name. The loop runs the handler you registered and calls the provider again with the result. |
| `{ error }` | Fails the turn with that message — what a provider error looks like to the UI. |
| `{ wait }` | Pauses for that many milliseconds — a slow model, a long tool. |
| `{ usage }` | Overrides the usage reported at the end (merged over the estimate). |

## Scenarios, matched to what was asked

```ts
createScenarioProvider({
  scenarios: {
    default:  'Ask me for a haiku, or the weather.',
    haiku:    { when: /haiku/i, turn: 'Web components hum —  \nno framework in the wind,  \njust the page, alive.' },
    weather:  { when: 'weather', turn: [{ text: 'Let me check.' }, { tool: 'get_weather', input: { city: 'Lille' } }] },
    forecast: { after: 'get_weather', turn: 'Cloudy, 14 °C. Bring a jacket.' },
  },
});
```

The rule that picks a scenario for each call: a tool result goes to the scenario that
declared `after` for that tool; otherwise the first scenario whose `when` matches the
last user message (a string is a case-insensitive substring, a RegExp is tested as is);
otherwise `default`; otherwise the first one declared. A bare string or step list is a
scenario with no condition. Pass `match(request, scenarios)` to pick by a rule of your
own — return `undefined` to fall back to the default rule.

The `get_weather` above only does something if the app registered a tool of that name
(`aparteGlobalConfig.registerTool`); an unregistered tool fails the call the way it
would with a real model, which is also a scenario worth having.

## Pace, usage, the model picker

`pacing: { chunk: 12, delay: 24 }` (the defaults) streams twelve characters every 24 ms;
`pacing: 'instant'` gives a test the whole reply at once. Every turn ends with a `done`
carrying an estimated usage — four characters per token — so a context gauge moves;
a `{ usage }` step overrides it.

The provider is local and keyless (`isLocal: true`, an empty config schema) and offers
one model, `scripted`, declaring `streaming` and `function_calling`, so the model
selector and the tool gate work unchanged; pass `models` to offer others.

## The ready-made showcase

```ts
import { aparteGlobalConfig } from '@aparte/core';
import { createScenarioProvider, showcase } from '@aparte/provider-scenario';

aparteGlobalConfig.registerAIProvider(createScenarioProvider({ scenarios: showcase }));
```

`showcase` answers *haiku*, *table*, *code*, *weather* (a tool round-trip), *ask me a
question* (an `ask_user` call, answered by `@aparte/plugin-ask-user`'s panel), *artifact*,
*slow* and *fail* — the surface a chat has, in one registration. It is what the docs'
live frames run on.

## What it is not

This repository's own browser suite keeps its network mock: that suite tests the real
wire path — provider format, transport, auth — which this provider bypasses by
construction. Use the scenario provider to test **your** app around the chat, not to
test aparté's adapters.
