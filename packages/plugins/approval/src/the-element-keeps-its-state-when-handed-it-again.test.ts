/**
 * `<aparte-approval-mode>` held to the contract every manifest's elements keep (core's
 * `element-contract.ts`): handed its labels again, the open list stays open and the focus stays.
 */
import { aparteGlobalConfig } from '@aparte/core';
import { setupApproval } from './approval.js';
import './aparte-approval-mode.js';
import { describeElementContract, manifestOf } from '../../../core/src/__tests__/element-contract.js';

describeElementContract(manifestOf('packages/plugins/approval'), {
    'aparte-approval-mode': {
        mount: (el) => {
            aparteGlobalConfig.reset();
            setupApproval({ classify: { write: ['write_file'] }, mode: 'ask' }, aparteGlobalConfig);
            return el;
        },
        properties: { labels: { plan: 'Planifier' } },
        // The list open, the focus on its trigger.
        use: (el) => {
            const select = el.querySelector('aparte-select') as HTMLElement & { open: boolean };
            select.querySelector<HTMLElement>('.aparte-select-trigger')!.focus();
            select.open = true;
        },
    },
});
