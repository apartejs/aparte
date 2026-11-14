// @vitest-environment node
/**
 * The DOM-free entry imports and works without a document.
 *
 * In Node, `@aparte/core` resolves to its own DOM-free barrel; this file points the import at
 * it (the package's test config aliases the browser one). A server computes a diff, reads one
 * and writes one back, and `setupDiff` registers its display and draws nothing.
 */
import { describe, it, expect, vi } from 'vitest';
import * as core from '@aparte/core';
import { diffTexts, formatUnifiedDiff, parseUnifiedDiff, setupDiff } from '../index.node.js';

vi.mock('@aparte/core', async () => await import('../../../../core/src/index.node.js'));

describe('the node entry', () => {
    it('imports without a DOM, computes a diff, and sets up', () => {
        expect(typeof document).toBe('undefined');
        const file = diffTexts('a\nb\n', 'a\nc\n', { path: 'x.txt' });
        expect(file).toMatchObject({ added: 1, removed: 1 });
        expect(parseUnifiedDiff(formatUnifiedDiff(file))).toEqual([file]);
        const config = new core.AparteConfig();
        const stop = setupDiff({ tool: 'edit_file' }, config);
        const details = config.getToolDisplay('edit_file')!.details as (s: unknown) => unknown;
        expect(details({ id: 't', type: 'tool_call', status: 'resolved', toolCall: { id: 'c', name: 'edit_file', input: {} }, result: formatUnifiedDiff(file) })).toBe('');
        stop();
        expect(config.getToolDisplay('edit_file')).toBeUndefined();
    });
});
