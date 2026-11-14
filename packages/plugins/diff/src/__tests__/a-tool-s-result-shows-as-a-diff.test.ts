/**
 * `setupDiff` shows an edit tool's result as a diff, under the tool's line in the reply.
 *
 * The row stays core's — its name, the summary the app gave it, its states — and what it holds
 * behind its line is the change, opened. Drawn again from the same result (an update, a
 * language switch), it is the same element, with what the reader opened in it. A result that
 * is not a change shows nothing behind the line, and says so once to the developer. Taking the
 * setup off gives back what the tool showed before.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, AparteConfig, registerDefaultRenderers, type AparteMessage, type AparteToolCallSegment } from '@aparte/core';
import { setupDiff } from '../index.js';
import type { AparteDiff } from '../aparte-diff.js';

const stops: Array<() => void> = [];
afterEach(() => {
    while (stops.length) stops.pop()!();
    aparteGlobalConfig.reset();
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

const BEFORE = 'const a = 1;\nconst b = 2;\n';
const AFTER = 'const a = 1;\nconst b = 3;\n';

function call(result: unknown, status: AparteToolCallSegment['status'] = 'resolved', id = 't1'): AparteToolCallSegment {
    return {
        id, type: 'tool_call', status,
        toolCall: { id: `c-${id}`, name: 'edit_file', input: { path: 'src/a.ts' } },
        ...(status === 'resolved' ? { result: typeof result === 'string' ? result : JSON.stringify(result) } : {}),
    } as AparteToolCallSegment;
}

const map = (result: { before: string; after: string }, input: Record<string, unknown>) => ({ path: String(input['path']), before: result.before, after: result.after });

const detailsOf = (config = aparteGlobalConfig) => config.getToolDisplay('edit_file')!.details as (s: AparteToolCallSegment) => HTMLElement | string;

describe('setupDiff', () => {
    it('puts the change behind the tool’s line, opened, from what map reads', () => {
        stops.push(setupDiff({ tool: 'edit_file', map }));
        expect(aparteGlobalConfig.getToolDisplay('edit_file')?.open).toBe(true);
        const shown = detailsOf()(call({ before: BEFORE, after: AFTER })) as AparteDiff;
        expect(shown.tagName).toBe('APARTE-DIFF');
        expect(shown.diff).toEqual({ path: 'src/a.ts', before: BEFORE, after: AFTER });
        expect(shown.hasAttribute('commentable')).toBe(false);
    });

    it('draws in the real row of a reply, beside the summary the app gave the tool', () => {
        registerDefaultRenderers();
        aparteGlobalConfig.registerToolDisplay('edit_file', { summary: (s) => String(s.toolCall.input['path']) });
        stops.push(setupDiff({ tool: 'edit_file', map }));
        const viewport = document.createElement('aparte-chat-viewport') as HTMLElement & { appendMessage(m: AparteMessage, o?: { historical?: boolean }): void };
        document.body.append(viewport);
        viewport.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 1, segments: [call({ before: BEFORE, after: AFTER })] } as AparteMessage, { historical: true });
        const row = viewport.querySelector<HTMLElement>('.aparte-segment-tool-call')!;
        expect(row.textContent).toContain('src/a.ts');
        const diff = row.querySelector('aparte-diff')!;
        expect(diff.querySelectorAll('.aparte-diff-line')).toHaveLength(3);
        expect(diff.closest('details')!.open).toBe(true);
    });

    it('gives the same element for the same result, and a new one for a new result', () => {
        stops.push(setupDiff({ tool: 'edit_file', map }));
        const first = detailsOf()(call({ before: BEFORE, after: AFTER }));
        expect(detailsOf()(call({ before: BEFORE, after: AFTER }))).toBe(first);
        expect(detailsOf()(call({ before: BEFORE, after: 'x\n' }))).not.toBe(first);
    });

    it('shows nothing behind a call that has not finished', () => {
        stops.push(setupDiff({ tool: 'edit_file', map }));
        for (const status of ['pending', 'awaiting-approval', 'rejected', 'failed', 'aborted'] as const) {
            expect(detailsOf()(call(undefined, status))).toBe('');
        }
    });

    it('reads a result that is already a diff without map: a unified diff, a file’s texts, a list', () => {
        stops.push(setupDiff({ tool: 'edit_file', commentable: true, open: false }));
        expect(aparteGlobalConfig.getToolDisplay('edit_file')?.open).toBe(false);
        const text = detailsOf()(call('--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n', 'resolved', 'u')) as AparteDiff;
        expect(typeof text.diff).toBe('string');
        expect(text.hasAttribute('commentable')).toBe(true);
        expect((detailsOf()(call({ path: 'p', before: 'a', after: 'b' }, 'resolved', 'v')) as AparteDiff).diff).toEqual({ path: 'p', before: 'a', after: 'b' });
        expect(detailsOf()(call([{ path: 'p', before: 'a', after: 'b' }], 'resolved', 'w'))).not.toBe('');
    });

    it('shows nothing for a result that is not a change, and tells the developer once', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        stops.push(setupDiff({ tool: 'edit_file' }));
        expect(detailsOf()(call('Saved.', 'resolved', 'a'))).toBe('');
        expect(detailsOf()(call({ ok: true }, 'resolved', 'b'))).toBe('');
        expect(warn).toHaveBeenCalledTimes(1);
        // A map that says "nothing here" is not an error.
        stops.pop()!();
        stops.push(setupDiff({ tool: 'edit_file', map: () => null }));
        expect(detailsOf()(call({}, 'resolved', 'c'))).toBe('');
        stops.pop()!();
        stops.push(setupDiff({ tool: 'edit_file', map: () => { throw new Error('bad'); } }));
        expect(detailsOf()(call({}, 'resolved', 'd'))).toBe('');
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('keeps what a broader display said of the tool, and gives back what was there when taken off', () => {
        aparteGlobalConfig.registerToolDisplay('*', { quiet: false });
        const stop = setupDiff({ tool: ['edit_file', 'write_file'], map });
        expect(aparteGlobalConfig.getToolDisplay('edit_file')?.quiet).toBe(false);
        stop();
        stop();
        expect(aparteGlobalConfig.getToolDisplay('edit_file')?.details).toBeUndefined();
        expect(aparteGlobalConfig.getToolDisplay('edit_file')?.quiet).toBe(false);

        const own = () => 'mine';
        aparteGlobalConfig.registerToolDisplay('edit_file', { label: 'Edit', details: own });
        const again = setupDiff({ tool: 'edit_file', map });
        again();
        expect(aparteGlobalConfig.getToolDisplay('edit_file')).toMatchObject({ label: 'Edit', details: own });

        // An app that put its own details on since: it stays.
        const third = setupDiff({ tool: 'edit_file', map });
        const later = () => 'later';
        aparteGlobalConfig.registerToolDisplay('edit_file', { details: later });
        third();
        expect(aparteGlobalConfig.getToolDisplay('edit_file')?.details).toBe(later);
    });

    it('registers on the config it is given', () => {
        const config = new AparteConfig();
        stops.push(setupDiff({ tool: /^edit_/, map }, config));
        expect(config.getToolDisplay('edit_file')?.details).toBeTypeOf('function');
        expect(aparteGlobalConfig.getToolDisplay('edit_file')).toBeUndefined();
    });
});
