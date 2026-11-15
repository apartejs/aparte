/**
 * `setupDiff` gives the tool an approval preview: the change its input holds, drawn in the
 * approval question before the call has run — from `before`/`after`, from `old_string`/
 * `new_string`, or from the app's own `preview`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, type AparteToolCall } from '@aparte/core';
import { setupDiff } from '../index.js';
import type { AparteDiff } from '../aparte-diff.js';

const stops: Array<() => void> = [];
afterEach(() => {
    while (stops.length) stops.pop()!();
    aparteGlobalConfig.reset();
    vi.restoreAllMocks();
});

const callOf = (input: Record<string, unknown>): AparteToolCall => ({ id: 'c1', name: 'edit_file', input });
const previewOf = (call: AparteToolCall) => aparteGlobalConfig.getToolDisplay('edit_file')!.approvalPreview!(call);

describe('the approval preview of setupDiff', () => {
    it('draws before and after from the input', () => {
        stops.push(setupDiff({ tool: 'edit_file' }));
        const shown = previewOf(callOf({ path: 'a.ts', before: 'x\n', after: 'y\n' })) as AparteDiff;
        expect(shown.tagName).toBe('APARTE-DIFF');
        expect(shown.diff).toEqual({ path: 'a.ts', before: 'x\n', after: 'y\n' });
    });

    it('draws old_string and new_string, with the file in file_path', () => {
        stops.push(setupDiff({ tool: 'edit_file' }));
        const shown = previewOf(callOf({ file_path: 'b.ts', old_string: 'one', new_string: 'two' })) as AparteDiff;
        expect(shown.diff).toEqual({ path: 'b.ts', before: 'one', after: 'two' });
    });

    it('draws nothing for an input that holds no two texts', () => {
        stops.push(setupDiff({ tool: 'edit_file' }));
        expect(previewOf(callOf({ path: 'a.ts' }))).toBeNull();
    });

    it('takes the app\'s own preview, and `false` for none', () => {
        stops.push(setupDiff({ tool: 'edit_file', preview: (input) => ({ path: String(input['name']), before: '', after: String(input['body']) }) }));
        const shown = previewOf(callOf({ name: 'n.md', body: 'hi' })) as AparteDiff;
        expect(shown.diff).toEqual({ path: 'n.md', before: '', after: 'hi' });
        stops.pop()!();
        stops.push(setupDiff({ tool: 'edit_file', preview: false }));
        expect(previewOf(callOf({ before: 'a', after: 'b' }))).toBeNull();
    });

    it('a preview that throws costs the approval its preview, not its question', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        stops.push(setupDiff({ tool: 'edit_file', preview: () => { throw new Error('boom'); } }));
        expect(previewOf(callOf({ before: 'a', after: 'b' }))).toBeNull();
    });

    it('is given back with the rest of the display when the setup is taken off', () => {
        const mine = () => 'mine';
        aparteGlobalConfig.registerToolDisplay('edit_file', { approvalPreview: mine });
        const stop = setupDiff({ tool: 'edit_file' });
        expect(aparteGlobalConfig.getToolDisplay('edit_file')!.approvalPreview).not.toBe(mine);
        stop();
        expect(aparteGlobalConfig.getToolDisplay('edit_file')!.approvalPreview).toBe(mine);
    });
});
