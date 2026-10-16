/**
 * What the Assistant's scripted model says. Everything else on the page is the real library; only
 * the model is a script, so the template answers without a key and the same way every time.
 */
import type { AparteMessage } from '@aparte/core';
import type { Scenario, ScenarioTurn } from '@aparte/provider-scenario';

export const SCENARIOS: Record<string, Scenario | ScenarioTurn> = {
    default:
        'I can explain a concept, write or review code, or plan a piece of work. Try one of the suggestions, or ask your own question.',
    explain: {
        when: /web component|custom element|shadow/i,
        turn: [
            { thinking: 'They want the idea and a minimal example. Start from what the browser does, then show the smallest element.' },
            {
                text: 'A **web component** is a tag the browser upgrades to a class you wrote. It carries its own markup and behaviour, and it works in any framework, or none.\n\n```js\nclass HelloName extends HTMLElement {\n  connectedCallback() {\n    this.textContent = `Hello, ${this.getAttribute("name") ?? "you"}`;\n  }\n}\ncustomElements.define("hello-name", HelloName);\n```\n\nUse it like any tag: `<hello-name name="Ada"></hello-name>`.',
            },
        ],
    },
};

/** The conversation a tile shows, finished: the grid never waits for a reply. */
export const SEED: AparteMessage[] = [
    { id: 'u1', role: 'user', content: 'What is a web component, in two sentences and an example?', timestamp: Date.parse('2026-10-16T09:40:00') },
    {
        id: 'a1',
        role: 'assistant',
        timestamp: Date.parse('2026-10-16T09:40:05'),
        content:
            'A **web component** is a tag the browser upgrades to a class you wrote. It carries its own markup and behaviour, and it works in any framework, or none.\n\n```js\nclass HelloName extends HTMLElement {\n  connectedCallback() {\n    this.textContent = `Hello, ${this.getAttribute("name") ?? "you"}`;\n  }\n}\ncustomElements.define("hello-name", HelloName);\n```',
    },
];

/** The conversations in the sidebar. */
export const HISTORY = [
    { id: 'c1', title: 'What is a web component?', updatedAt: Date.parse('2026-10-16T09:40:05') },
    { id: 'c2', title: 'Plan the launch week', updatedAt: Date.parse('2026-10-15T17:12:00') },
    { id: 'c3', title: 'Review my SQL migration', updatedAt: Date.parse('2026-10-12T11:03:00') },
];

/** What the landing's showcase types, once it is on screen. */
export const PLAY_QUESTION = 'What is a web component, in two sentences and an example?';
