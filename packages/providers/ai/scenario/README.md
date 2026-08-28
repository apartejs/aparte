# @aparte/provider-scenario

A **scripted model** for aparté: it replays turns you wrote — text at a typing pace,
thinking, tool calls, errors, pauses — instead of calling a model. No key, no network,
the same answer every time. For demos and docs that should stream something real, and
for **your own tests**, which get a deterministic model.

```bash
npm install @aparte/provider-scenario @aparte/core
```

`@aparte/core` is the only **peer dependency**; this package has none of its own.

```ts
import { aparteGlobalConfig, AparteClient, AparteDirectTransport } from '@aparte/core';
import { createScenarioProvider } from '@aparte/provider-scenario';

aparteGlobalConfig.registerAIProvider(createScenarioProvider({
  turns: [
    'Hello! Ask me anything.',
    [{ thinking: 'Let me see…' }, { text: 'Here is my **answer**.' }],
  ],
}));
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
new AparteClient().start();
```

`turns` answers calls in order and repeats the last one. For a model that answers
*according to what was asked*, name scenarios and let `when` / `after` pick:

```ts
createScenarioProvider({
  scenarios: {
    default: 'Ask me for a haiku, or the weather.',
    haiku:   { when: /haiku/i, turn: 'Web components hum —  \nno framework in the wind,  \njust the page, alive.' },
    weather: { when: 'weather', turn: [{ text: 'Let me check.' }, { tool: 'get_weather', input: { city: 'Lille' } }] },
    forecast: { after: 'get_weather', turn: 'Cloudy, 14 °C. Bring a jacket.' },
  },
});
```

A tool step calls the tool you registered on the config; the real loop runs its handler
and calls the provider again with the result, which `after` answers. `pacing:
{ chunk, delay }` sets the typing speed; `pacing: 'instant'` gives a test the whole
reply at once. `showcase` is a ready-made set covering markdown, code, reasoning, a tool
round-trip, a typed question (`ask_user`), an artifact and an error.

Full guide: [apartejs.dev/providers/ai/scenario](https://apartejs.dev/providers/ai/scenario/).
