/**
 * `<aparte-triggers>` held to the contract every manifest's elements keep (core's
 * `element-contract.ts`): handed what it already holds, it keeps the open list and its row.
 */
import '@aparte/core';
import type { AparteComposerInput } from '@aparte/core';
import '../aparte-triggers.js';
import { describeElementContract, manifestOf } from '../../../../core/src/__tests__/element-contract.js';

describeElementContract(manifestOf('packages/plugins/triggers'), {
    'aparte-triggers': {
        mount: (el) => {
            const composer = document.createElement('aparte-composer');
            composer.append(el, document.createElement('aparte-composer-input'));
            return composer;
        },
        properties: { triggers: [{ char: '@', at: 'word', items: [{ id: 'a', label: 'Anna' }, { id: 'p', label: 'Paul' }] }] },
        // The list open on `@`, the keyboard on its second row.
        use: (el) => {
            const input = el.closest('aparte-composer')!.querySelector<AparteComposerInput>('aparte-composer-input')!;
            const editor = input.querySelector<HTMLElement>('.aparte-ci-editor')!;
            editor.textContent = '@';
            const range = document.createRange();
            range.setStart(editor.firstChild!, 1);
            range.collapse(true);
            document.getSelection()!.removeAllRanges();
            document.getSelection()!.addRange(range);
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        },
    },
});
