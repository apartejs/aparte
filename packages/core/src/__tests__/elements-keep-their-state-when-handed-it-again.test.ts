/**
 * Every element of core, held to the contract in `element-contract.ts`: an attribute written
 * again with its own value changes nothing, a property assigned again keeps what the person was
 * doing. A wrapper re-applies a whole prop bag whenever the bag changes, so this is what a React
 * render, a Vue deep watch or a Svelte reassignment does to an element many times a second.
 */
import '../index.js';
import { describeElementContract, manifestOf } from './element-contract.js';

describeElementContract(manifestOf('packages/core'), {
    'aparte-conversation-list': {
        properties: {
            conversations: [
                { id: 'a', title: 'One' },
                { id: 'b', title: 'Two' },
            ],
        },
        // A row's menu open, the focus in it.
        use: (el) => {
            el.querySelector<HTMLElement>('[data-more-id="b"]')!.click();
        },
    },
    'aparte-suggestions': {
        properties: { suggestions: ['Plan a trip', 'Write a haiku'] },
        use: (el) => {
            el.querySelectorAll<HTMLElement>('.aparte-suggestion')[1]!.focus();
        },
    },
    'aparte-chat': {
        skip: {
            'data-aparte-chat': 'stamped by the chat itself, never set by an app',
            'data-empty': 'the chat\'s own state, which its layout watches; never set by an app',
        },
    },
});
