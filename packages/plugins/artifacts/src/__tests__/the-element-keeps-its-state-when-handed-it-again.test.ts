/**
 * `<aparte-artifact-panel>` held to the contract every manifest's elements keep (core's
 * `element-contract.ts`): handed its chat, its documents, its reader, its tool names or its
 * renderer again, the tab the reader chose stays chosen and the focus stays on it.
 */
import { afterAll, beforeAll } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import type { AparteMessage } from '@aparte/core';
import { setupArtifacts } from '../index.js';
import '../panel.js';
import { describeElementContract, manifestOf } from '../../../../core/src/__tests__/element-contract.js';

let teardown: (() => void) | null = null;
beforeAll(() => {
    teardown = setupArtifacts();
    aparteGlobalConfig.setMarkdownProvider((raw) => raw.replace(/^# (.*)$/m, '<h1>$1</h1>'));
});
afterAll(() => {
    teardown?.();
    aparteGlobalConfig.reset();
});

const messages: AparteMessage[] = [{
    id: 'a1', role: 'assistant', content: '', timestamp: 0,
    segments: [{
        id: 'seg-1', type: 'tool_call', status: 'resolved', result: 'ok',
        toolCall: { id: 'call-1', name: 'create_artifact', input: {} },
        structuredResult: { documentId: 'doc_1', mimeType: 'text/markdown', title: 'Plan', content: '# Plan' },
    }],
} as AparteMessage];

describeElementContract(manifestOf('packages/plugins/artifacts'), {
    'aparte-artifact-panel': {
        mount: (el) => {
            const box = document.createElement('div');
            const chat = Object.assign(document.createElement('div'), { getMessages: () => messages });
            chat.id = 'chat';
            el.setAttribute('for', 'chat');
            box.append(chat, el);
            return box;
        },
        // The source tab chosen, the focus on it.
        use: (el) => {
            const code = el.querySelector<HTMLButtonElement>('[data-tab-target="code"]')!;
            code.click();
            code.focus();
        },
    },
});
