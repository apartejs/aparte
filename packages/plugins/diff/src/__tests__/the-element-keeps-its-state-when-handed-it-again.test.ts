/**
 * `<aparte-diff>` held to the contract every manifest's elements keep (core's
 * `element-contract.ts`): handed its change or its comments again, the reader keeps the lines
 * they picked, the field they were writing in and the focus.
 */
import '../aparte-diff.js';
import { describeElementContract, manifestOf } from '../../../../core/src/__tests__/element-contract.js';
import { click, FORTY, gutter } from './harness.js';

describeElementContract(manifestOf('packages/plugins/diff'), {
    'aparte-diff': {
        mount: (el) => {
            el.setAttribute('commentable', '');
            return el;
        },
        properties: {
            diff: FORTY,
            comments: [{ path: 'src/long.ts', side: 'new', startLine: 17, endLine: 17, text: 'Earlier', state: 'sent' }],
        },
        // Two lines picked, the field open with words in it.
        use: (el) => {
            click(gutter(el, 'context', 18));
            click(gutter(el, 'add', 20), { shiftKey: true });
            const input = el.querySelector('textarea')!;
            input.value = 'half written';
        },
    },
});
