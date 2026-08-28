import type { Scenario } from './index.js';

/**
 * A ready-made set of scenarios that shows the whole surface of a chat: markdown, a
 * code block, reasoning, a tool round-trip, a typed question, an artifact, an error.
 * The docs' live frames and a demo page can register it as is:
 *
 * ```ts
 * aparteGlobalConfig.registerAIProvider(createScenarioProvider({ scenarios: showcase }));
 * ```
 *
 * The tool names it calls — `get_weather`, `ask_user` — only do something if the app
 * registered a tool of that name; `@aparte/plugin-ask-user` provides the second.
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
        turn: 'Here is a first draft:\n\n<artifact type="text/markdown" title="Launch note">## aparté\n\nA chat in Web Components, with the agent loop inside.\n\n- any framework\n- zero dependencies\n</artifact>\n\nTell me what to change.',
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
