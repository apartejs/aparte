/**
 * The conversations the sidebar lists, and the transcript each one opens on.
 *
 * Written by hand, not stored anywhere: this example is the UI of a chat site, and a
 * UI needs something to show — a list grouped by date, a pinned entry, a few threads
 * with real markdown in them. Reloading the page brings them back exactly as they are.
 * Where a real site would read these from a store, the persistence guide shows the
 * conversation manager and the storage adapter that do it.
 */
import type { AparteConversationListItem, AparteMessage } from '@aparte/core';

export interface SampleConversation extends AparteConversationListItem {
    messages: AparteMessage[];
}

const HOUR = 36e5;
const DAY = 864e5;
const now = Date.now();

let seq = 0;
const at = (ago: number) => now - ago;
const user = (content: string, ago: number): AparteMessage =>
    ({ id: `u${++seq}`, role: 'user', content, timestamp: at(ago) });
const assistant = (content: string, ago: number): AparteMessage =>
    ({ id: `a${++seq}`, role: 'assistant', content, timestamp: at(ago) });

export const SAMPLE_CONVERSATIONS: SampleConversation[] = [
    {
        id: 'c-aparte',
        title: 'What is aparté?',
        updatedAt: at(2 * HOUR),
        pinnedAt: at(2 * DAY),
        messages: [
            user('What is aparté, in one sentence?', 2 * HOUR + 60e3),
            assistant(
                'A chat UI in **Web Components** with the agent loop inside: streaming markdown, tool calls, '
                + 'attachments and branching, in any framework or none, with zero third-party dependencies.',
                2 * HOUR,
            ),
        ],
    },
    {
        id: 'c-haiku',
        title: 'A haiku about web components',
        updatedAt: at(5 * HOUR),
        messages: [
            user('Write a haiku about web components.', 5 * HOUR + 40e3),
            assistant('Custom elements wake —\nlight DOM, no framework asked,\nthe page holds its shape.', 5 * HOUR),
        ],
    },
    {
        id: 'c-table',
        title: 'Compare three frameworks',
        updatedAt: at(DAY + 3 * HOUR),
        messages: [
            user('Give me a markdown table comparing React, Vue and Svelte on bundle size and reactivity.', DAY + 3 * HOUR + 90e3),
            assistant(
                '| Framework | Runtime size (min+gz) | Reactivity |\n'
                + '| --- | --- | --- |\n'
                + '| React | ~45 kB | re-render on state change, reconciled by a virtual DOM |\n'
                + '| Vue | ~34 kB | proxies track reads; only dependent effects re-run |\n'
                + '| Svelte | ~2 kB + per-component code | compiled: assignments become DOM updates |\n\n'
                + 'Sizes are orders of magnitude, not benchmarks — measure your own build.',
                DAY + 3 * HOUR,
            ),
        ],
    },
    {
        id: 'c-code',
        title: 'Debounce in TypeScript',
        updatedAt: at(DAY + 9 * HOUR),
        messages: [
            user('Show me a typed debounce helper.', DAY + 9 * HOUR + 30e3),
            assistant(
                'Here is one that keeps the wrapped function\'s parameter types:\n\n'
                + '```ts\n'
                + 'export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait = 200) {\n'
                + '    let timer: ReturnType<typeof setTimeout> | undefined;\n'
                + '    return (...args: A): void => {\n'
                + '        clearTimeout(timer);\n'
                + '        timer = setTimeout(() => fn(...args), wait);\n'
                + '    };\n'
                + '}\n'
                + '```\n\n'
                + 'The return type is `void` on purpose: a debounced call has no result to hand back.',
                DAY + 9 * HOUR,
            ),
        ],
    },
    {
        id: 'c-weather',
        title: 'Weather in Lille',
        updatedAt: at(3 * DAY),
        messages: [
            user('What is the weather in Lille right now?', 3 * DAY + 20e3),
            assistant('Cloudy, 14 °C in Lille, with a light wind from the west. Take a jacket.', 3 * DAY),
        ],
    },
    {
        id: 'c-theme',
        title: 'Theme it in three variables',
        updatedAt: at(6 * DAY),
        messages: [
            user('How do I change the accent colour of the chat?', 6 * DAY + 45e3),
            assistant(
                'Three custom properties on the chat, or on `:root`:\n\n'
                + '```css\n'
                + 'aparte-chat {\n'
                + '    --aparte-primary: #b8860b;\n'
                + '    --aparte-bubble-user-bg: #2b2418;\n'
                + '    --aparte-radius-bubble: 14px;\n'
                + '}\n'
                + '```\n\n'
                + 'Everything derives from the tokens, so the hover states and the focus ring follow.',
                6 * DAY,
            ),
        ],
    },
    {
        id: 'c-branch',
        title: 'Branch a reply',
        updatedAt: at(12 * DAY),
        messages: [
            user('Can I edit a message and keep the old answer?', 12 * DAY + 30e3),
            assistant(
                'Yes. Editing a user message starts a new branch; the previous reply stays on its own branch and '
                + 'the `‹ 1/2 ›` picker under the message switches between them.',
                12 * DAY,
            ),
        ],
    },
    {
        id: 'c-tools',
        title: 'Approve a tool call',
        updatedAt: at(19 * DAY),
        messages: [
            user('What happens when the model wants to run a tool?', 19 * DAY + 30e3),
            assistant(
                'The turn pauses on an approval panel when the tool is marked `needsApproval`; approve and the '
                + 'call runs, decline and the model is told so. The approval plugin adds modes on top: plan, ask, auto.',
                19 * DAY,
            ),
        ],
    },
    {
        id: 'c-local',
        title: 'Run a model in the browser',
        updatedAt: at(40 * DAY),
        messages: [
            user('Can the model run locally, without a server?', 40 * DAY + 30e3),
            assistant(
                'With `@aparte/provider-transformers`: the model loads in a worker and runs on WebGPU when the '
                + 'browser has it. The first load downloads the weights; the next ones read the cache.',
                40 * DAY,
            ),
        ],
    },
    {
        id: 'c-first',
        title: 'Hello',
        updatedAt: at(75 * DAY),
        messages: [
            user('Hello!', 75 * DAY + 10e3),
            assistant('Hello. Ask me anything — I am a scripted model, so I answer the same way every time.', 75 * DAY),
        ],
    },
];
