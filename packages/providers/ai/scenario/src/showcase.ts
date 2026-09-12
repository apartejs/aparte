import type { Scenario } from './index.js';

/**
 * A ready-made set of scenarios that shows the whole surface of a chat: markdown, a
 * code block, reasoning, a tool round-trip, a typed question, an artifact, an error.
 * It ships on its own entry point, so a consumer who writes their own scenarios
 * never pays for this one. The docs' live frames and a demo page register it as is:
 *
 * ```ts
 * import { createScenarioProvider } from '@aparte/provider-scenario';
 * import { showcase } from '@aparte/provider-scenario/showcase';
 *
 * aparteGlobalConfig.registerAIProvider(createScenarioProvider({ scenarios: showcase }));
 * ```
 *
 * The tool names it calls — `get_weather`, `ask_user`, and the release chain's
 * `search_docs` / `read_file` / `write_file` / `run_command` — only do something if the
 * app registered a tool of that name; `@aparte/plugin-ask-user` provides the second.
 */
export const showcase: Record<string, Scenario> = {
    default: {
        turn: 'Hi — I am a **scripted** model: no key, no network, the same answer every time.\n\nAsk me for a *haiku*, a *table*, some *code*, the *weather*, or to *ask you a question*.',
    },
    haiku: {
        when: /haiku/i,
        turn: 'Web components hum —  \nno framework in the wind,  \njust the page, alive.',
    },
    table: {
        when: /table/i,
        turn: 'Two ways to reach a model:\n\n| Transport | Where the key lives | Use it for |\n|---|---|---|\n| `AparteDirectTransport` | in the browser | prototypes, local models |\n| `AparteBackendTransport` | on your server | production |\n\nThe component does not change between the two.',
    },
    code: {
        when: /code|example|snippet/i,
        turn: [
            { thinking: 'The shortest useful wiring is three lines: register a provider, set a transport, start the client.' },
            { text: 'The minimal wiring:\n\n```ts\nimport { AparteClient, aparteGlobalConfig, AparteDirectTransport } from \'@aparte/core\';\nimport { createScenarioProvider } from \'@aparte/provider-scenario\';\n\naparteGlobalConfig.registerAIProvider(createScenarioProvider({ turns: [\'Hello!\'] }));\naparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));\nnew AparteClient().start();\n```\n\nThree lines that matter.' },
        ],
    },
    weather: {
        when: /weather|forecast/i,
        turn: [
            { text: 'Let me check that for you.' },
            { tool: 'get_weather', input: { city: 'Lille' } },
        ],
    },
    forecast: {
        after: 'get_weather',
        turn: 'Cloudy, 14 °C, a little wind from the west — bring a jacket.',
    },
    // Four tools, in a chain: search, read, write, run. The multi-tool agent turn
    // nothing in this repository could produce before — every other scenario calls one
    // tool and answers its result. It is also what a decision about grouping consecutive
    // tool calls needs before it can be taken: a real turn whose calls can be read on a
    // page, rather than an imagined wall of them.
    //
    // Each tool needs its own `after:` route, or the tool RESULT falls back through the
    // `when` that started the chain and the conversation eats its own tail —
    // `createScenarioProvider` warns about exactly that at creation.
    release: {
        when: /ship it|release|checklist/i,
        turn: [
            { text: 'Running the release checklist.' },
            { tool: 'search_docs', input: { query: 'release checklist' } },
        ],
    },
    releaseRead: {
        after: 'search_docs',
        turn: [{ tool: 'read_file', input: { path: 'CHANGELOG.md' } }],
    },
    releaseWrite: {
        after: 'read_file',
        turn: [{ tool: 'write_file', input: { path: 'CHANGELOG.md', contents: '## 0.17.0\n\n- the release\n' } }],
    },
    releaseRun: {
        after: 'write_file',
        turn: [{ tool: 'run_command', input: { cmd: 'pnpm build' } }],
    },
    releaseDone: {
        after: 'run_command',
        turn: 'Checklist done: docs searched, changelog read and updated, build green.',
    },
    // Several questions in one call: the panel becomes a stepper (1 2 …) with a
    // "Skip" per step. Nothing in the repository showed that mode until a consumer
    // reported clipped borders on it — a state no example renders is a state
    // nobody looks at. BEFORE `question`: scenarios are matched in order, and
    // "two questions" contains the word that one listens for.
    survey: {
        when: /survey|two questions|a few questions/i,
        turn: [
            { text: 'Two quick ones, then I can tailor it.' },
            {
                tool: 'ask_user',
                input: {
                    questions: [
                        {
                            question: 'Which colour do you favour?',
                            header: 'Colour',
                            options: [
                                { title: 'Blue', description: 'calm, trusted' },
                                { title: 'Green', description: 'fresh, natural' },
                                { title: 'Yellow', description: 'warm, loud' },
                            ],
                        },
                        {
                            question: 'How dense should the layout be?',
                            header: 'Density',
                            options: [
                                { title: 'Airy', description: 'more room, fewer items per screen', recommended: true },
                                { title: 'Compact', description: 'more on screen, tighter spacing' },
                            ],
                        },
                    ],
                },
            },
        ],
    },
    question: {
        when: /question|ask me|colou?r scheme/i,
        turn: [
            { text: 'One thing first.' },
            {
                tool: 'ask_user',
                input: {
                    questions: [{
                        question: 'Which mood for your landing page?',
                        header: 'Mood',
                        options: [
                            { title: 'Dark and quiet', description: 'ink, brass accents', recommended: true },
                            { title: 'Light and warm', description: 'cream, soft contrast' },
                            { title: 'Maximum contrast', description: 'strict black and white' },
                        ],
                    }],
                },
            },
        ],
    },
    answered: {
        after: 'ask_user',
        turn: 'Noted — I will go with that.',
    },
    artifact: {
        when: /artifact|document|write me/i,
        turn: 'Here is a first draft:\n\n<artifact type="text/markdown" title="Launch note">## aparté\n\nA chat in Web Components, with the agent loop inside.\n\n- any framework\n- zero third-party dependencies\n</artifact>\n\nTell me what to change.',
    },
    slow: {
        when: /slow|think hard|take your time/i,
        turn: [
            { thinking: 'This deserves a moment.' },
            { wait: 2500 },
            { text: 'Done thinking. The answer is: it depends on the transport.' },
        ],
    },
    failure: {
        when: /fail|error|crash/i,
        turn: [{ error: 'The scripted model exploded, as requested.' }],
    },
};
