# @aparte/provider-scenario

A **scripted model** for aparté: it replays turns you wrote — text at a typing pace,
thinking, tool calls, errors, pauses — instead of calling a model. No key, no network,
the same answer every time. For demos and docs that should stream something real, and
for **your own tests**, which get a deterministic model.

```bash
npm install @aparte/provider-scenario @aparte/core
```

`@aparte/core` is the only **peer dependency**; this package has none of its own.

It stands in for the **whole provider**: everything above it — the loop, tool execution
and approval, the transcript, your renderers — runs for real, and nothing below it runs at
all. So it tests an app that talks to a model over HTTP (BYOK, a backend, a local server).
It does not test a provider you wrote yourself — a worker, a wire format, a tool-call
parser — since that is exactly the part it replaces; keep a fake of your own for that layer.

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
reply at once. `showcase` is a ready-made set covering markdown, code, reasoning, a
tool round-trip, a typed question (`ask_user`), an answer with its sources, an artifact (a
card once `@aparte/plugin-artifacts` is set up, prose otherwise) and an error; it is imported
from `@aparte/provider-scenario/showcase`, its own entry point, so your own scenarios
do not pay for it.

## Sources and citations

A `sources` step lists the sources a reply draws on, and its `citations` say where in the text
each one is cited. Put it after the text it cites: a citation's `start` and `end` are UTF-16
offsets into the text the turn has streamed so far (its `text` steps joined, `end` exclusive),
and a chip goes at the end of the passage. Source ids are unique within the turn, and a citation
names them.

```ts
const first = 'The sky is blue because air scatters short wavelengths.';
const second = ' Sunsets are red for the opposite reason.';

createScenarioProvider({
  turns: [[
    { text: first + second },
    {
      sources: [
        { id: 'a', url: 'https://en.wikipedia.org/wiki/Rayleigh_scattering', title: 'Rayleigh scattering', snippet: 'Scattering by particles smaller than the wavelength.' },
        { id: 'b', url: 'https://www.nasa.gov/', title: 'NASA' },
      ],
      // One passage citing two sources shows as "+1". `end` is exclusive.
      citations: [{ start: 0, end: first.length, sources: ['a', 'b'] }],
    },
  ]],
});
```

Compute the offsets from the strings (`text.indexOf(passage)`) rather than counting by hand, so
an edit to a sentence cannot leave a chip on the wrong words. Ask the `showcase` for *"why is
the sky blue?"* or *"with sources"* to see a three-source answer.

## Sub-agents

A `subagents` step makes the model delegate: it calls one ordinary tool, `delegate`, with
`{ agents: [{ name, task }] }`, which is what a real model would send. Each entry is a
`ScenarioSubagent`: its `name`, its `task`, and the `turns` its own model plays. Register the
tool that runs them with `scenarioSubagentTool(provider)`, and add `setupSubagents()` from
`@aparte/plugin-subagents` to see one line per sub-agent:

```ts
import { aparteGlobalConfig } from '@aparte/core';
import { createScenarioProvider, scenarioSubagentTool } from '@aparte/provider-scenario';
import { setupSubagents } from '@aparte/plugin-subagents';

const provider = createScenarioProvider({
  turns: [
    // One sub-agent: its line is the delegate call's row.
    [{ text: 'Let me hand that off.' }, { subagents: [
      { name: 'Researcher', task: 'Read the parser', turns: [
        [{ tool: 'read_file', input: { path: 'src/parser.ts' } }],
        'It splits the input on commas and never checks for quotes.',
      ] },
    ] }],
    'The parser does not handle quoted commas. Want a fix?',
    // Several: they run side by side, each on a line of its own.
    [{ subagents: [
      { name: 'Reader', task: 'Read the parser', turns: ['It splits on commas.'] },
      { name: 'Searcher', task: 'Find its callers', turns: ['Two callers: import.ts and cli.ts.'] },
      { name: 'Tester', task: 'Run the tests', turns: ['12 pass, 1 fails on a quoted field.'] },
    ] }],
    'All three are back: the quoted field is the bug.',
  ],
});
aparteGlobalConfig.registerAIProvider(provider);
const { tool, handler } = scenarioSubagentTool(provider);
aparteGlobalConfig.registerTool(tool, handler);
setupSubagents();
```

Each sub-agent runs through the real loop, as a nested run of its own: its `{ tool }` steps run
the handlers registered on the config (`read_file` above is yours to register) and its next turn
follows their result; a
`subagents` step in its turn delegates again. Its words never reach the reply. What the model
reads back is the sub-agent's last text, or, for several, one `name: text` block each; a
sub-agent that fails is said in a sentence, and does not fail the call. Stop ends them with the
turn. With `scenarios`, route the answer with `after: 'delegate'`, as for any tool; name the
tool otherwise with `toolName` on the step and `scenarioSubagentTool(provider, { name })`. The
handler needs the loop: called outside it (no `context.run`), it throws.

Full guide: [apartejs.dev/providers/ai/scenario](https://apartejs.dev/providers/ai/scenario/).
