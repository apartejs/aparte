/**
 * setupN8nButtons — a Chat node's buttons, asked at the composer with their own labels.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import type { AparteElicitationRequest, AparteToolCallSegment } from '@aparte/core';
import { setupN8nButtons, N8N_BUTTONS_TOOL } from '../index.js';
import type { N8nButtonsInput } from '../index.js';

const input: N8nButtonsInput = {
    text: 'Shall I book a table for tonight?',
    blockUserInput: true,
    buttons: [{ text: 'Book it', type: 'primary' }, { text: 'No thanks', type: 'secondary' }],
};
const call = { id: 'n8n-buttons-1', name: N8N_BUTTONS_TOOL, input: input as unknown as Record<string, unknown> };

afterEach(() => aparteGlobalConfig.reset());

describe('setupN8nButtons', () => {
    it('asks with the buttons as options, in their order and tone, and answers with the one chosen', async () => {
        const asked: AparteElicitationRequest[] = [];
        aparteGlobalConfig.setElicitationPresenter(async (request) => {
            asked.push(request);
            return { action: 'accept', content: { option: '1' } };
        });
        setupN8nButtons();
        const result = await aparteGlobalConfig.getToolHandler(N8N_BUTTONS_TOOL)!(call, new AbortController().signal);

        expect(asked[0]).toMatchObject({ kind: 'approval', message: 'Shall I book a table for tonight?' });
        expect(asked[0]!.options!.map((o) => [o.value, o.label, o.tone])).toEqual([['0', 'Book it', 'affirm'], ['1', 'No thanks', 'deny']]);
        expect(result).toEqual({ toolCallId: 'n8n-buttons-1', content: 'No thanks', structuredContent: { index: 1, text: 'No thanks' } });
    });

    it("answers with the person's own words when they write instead of choosing", async () => {
        aparteGlobalConfig.setElicitationPresenter(async () => ({ action: 'accept', content: { instruction: ' Tomorrow instead ' } }));
        setupN8nButtons();
        const result = await aparteGlobalConfig.getToolHandler(N8N_BUTTONS_TOOL)!(call, new AbortController().signal);
        expect(result).toEqual({ toolCallId: 'n8n-buttons-1', content: 'Tomorrow instead', structuredContent: { index: -1, text: 'Tomorrow instead', written: true } });
    });

    it('fails the call when the person declines without a button', async () => {
        aparteGlobalConfig.setElicitationPresenter(async () => ({ action: 'decline' }));
        setupN8nButtons();
        await expect(aparteGlobalConfig.getToolHandler(N8N_BUTTONS_TOOL)!(call, new AbortController().signal)).rejects.toThrow(/No button/);
    });

    it('names the line in the transcript after the answer, or the question while it waits', () => {
        setupN8nButtons();
        const display = aparteGlobalConfig.getToolDisplay(N8N_BUTTONS_TOOL)!;
        const segment = (result?: string) => ({ id: 's', type: 'tool_call', status: result ? 'resolved' : 'pending', toolCall: call, ...(result ? { result } : {}) }) as unknown as AparteToolCallSegment;
        const label = display.label as (s: AparteToolCallSegment) => string;
        expect(label(segment('Book it'))).toBe('Book it');
        expect(label(segment())).toBe('Shall I book a table for tonight?');
        expect(display).toMatchObject({ quiet: true, details: false });
    });
});
