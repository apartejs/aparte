import { describe, it, expect, vi } from 'vitest';
import { buildAskQuestionTool, type AskQuestionPayload } from '../ask-question.tool';
import type { ToolContext } from '../../tool';

const ctx = (signal?: AbortSignal): ToolContext => (signal ? { signal } : {});

describe('buildAskQuestionTool', () => {
    it('is a mandatory_always tool named ask_question', () => {
        const tool = buildAskQuestionTool(async () => 'x');
        expect(tool.descriptor.name).toBe('ask_question');
        expect(tool.marker).toEqual({ mode: 'mandatory_always' });
    });

    it('maps args to the payload and returns the user answer', async () => {
        let seen: AskQuestionPayload | undefined;
        const tool = buildAskQuestionTool(async (p) => { seen = p; return 'Paris'; });
        const result = await tool.handler(
            { question: 'Where?', options: [{ title: 'Paris' }, { title: 'London' }], multiple: false },
            ctx(),
        );
        expect(result).toBe('User answered : Paris');
        expect(seen?.question).toBe('Where?');
        expect(seen?.options.map(o => o.title)).toEqual(['Paris', 'London']);
        expect(seen?.allow_other).toBe(true); // default when not false
    });

    it('forwards the tool ctx.signal to the resolver', async () => {
        const resolver = vi.fn(async (_payload: unknown, _signal?: AbortSignal) => 'ok');
        const tool = buildAskQuestionTool(resolver);
        const controller = new AbortController();
        await tool.handler({ question: 'Q?', options: [{ title: 'a' }, { title: 'b' }] }, ctx(controller.signal));
        expect(resolver).toHaveBeenCalledOnce();
        expect(resolver.mock.calls[0]![1]).toBe(controller.signal);
    });

    it('rejects an empty question', async () => {
        const tool = buildAskQuestionTool(async () => 'x');
        expect(await tool.handler({ question: '   ' }, ctx())).toBe('FAILED: question manquante');
    });

    it('requires between 2 and 6 options', async () => {
        const tool = buildAskQuestionTool(async () => 'x');
        expect(await tool.handler({ question: 'Q?', options: [{ title: 'a' }] }, ctx()))
            .toBe('FAILED: au moins 2 options requises');
        const seven = Array.from({ length: 7 }, (_, i) => ({ title: `o${i}` }));
        expect(await tool.handler({ question: 'Q?', options: seven }, ctx()))
            .toBe('FAILED: max 6 options');
    });

    it('surfaces a resolver throw as a failed tool call', async () => {
        const tool = buildAskQuestionTool(async () => { throw new Error('user closed'); });
        const result = await tool.handler({ question: 'Q?', options: [{ title: 'a' }, { title: 'b' }] }, ctx());
        expect(result).toContain('FAILED: ask_question aborted');
        expect(result).toContain('user closed');
    });
});
