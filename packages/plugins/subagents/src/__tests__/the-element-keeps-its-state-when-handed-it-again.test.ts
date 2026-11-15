/**
 * `<aparte-subagent-view>` held to the contract every manifest's elements keep (core's
 * `element-contract.ts`): handed its chat again, the focus stays where the reader put it.
 */
import type { AparteMessage } from '@aparte/core';
import '../index.js';
import { describeElementContract, manifestOf } from '../../../../core/src/__tests__/element-contract.js';

const saved: AparteMessage = {
    id: 'm1', role: 'assistant', content: '', timestamp: 1, status: 'completed',
    segments: [{
        id: 'subagent-x', type: 'subagent',
        subagent: { id: 'x', name: 'Planner', description: 'Plan it', status: 'done', segments: [{ id: 't1', type: 'text', content: 'From a store.' }] },
    }],
} as AparteMessage;

describeElementContract(manifestOf('packages/plugins/subagents'), {
    'aparte-subagent-view': {
        mount: (el) => {
            el.setAttribute('message-id', 'm1');
            el.setAttribute('agent-id', 'x');
            el.setAttribute('closable', '');
            return el;
        },
        properties: { chat: { getMessages: () => [saved] } },
        // The keyboard on the view's close button.
        use: (el) => {
            el.querySelector<HTMLElement>('button')!.focus();
            if (!el.contains(document.activeElement)) throw new Error('the fixture did not put the focus in the view');
        },
    },
});
