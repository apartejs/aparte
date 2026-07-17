// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { AparteConfig } from '@aparte/core';
import type { AparteElicitationRequest, AparteElicitationResult } from '@aparte/core';
import { askQuestionTool, askQuestionHandler } from './ask-question.js';

// The LLM-facing tool schema.
describe('askQuestionTool', () => {
    it('has the correct name', () => {
        expect(askQuestionTool.name).toBe('ask_question');
    });

    it('accepts either a questions array or a single question (agnostic)', () => {
        const schema = askQuestionTool.inputSchema as any;
        expect(schema.properties.questions.type).toBe('array');
        expect(schema.properties.question.type).toBe('string');
        const forms = (schema.anyOf as any[]).map((f) => f.required[0]);
        expect(forms).toContain('questions');
        expect(forms).toContain('question');
    });

    it('each question requires a question string, options optional (maxItems 6)', () => {
        const schema = askQuestionTool.inputSchema as any;
        const item = schema.properties.questions.items;
        expect(item.required).toContain('question');
        expect(item.required).not.toContain('options');
        expect(item.properties.options.maxItems).toBe(6);
    });
});

describe('askQuestionHandler — elicitation adapter', () => {
    let lastRequest: AparteElicitationRequest | undefined;
    const sig = () => new AbortController().signal;
    const call = (input: Record<string, unknown>) => ({ id: 'c1', name: 'ask_question', input });

    /** Register a scripted presenter and capture the request it receives. */
    function presenter(result: AparteElicitationResult): void {
        AparteConfig.setElicitationPresenter(async (req) => { lastRequest = req; return result; });
    }
    const schema = () => lastRequest!.schema as any;

    afterEach(() => {
        AparteConfig.setElicitationPresenter(null);
        lastRequest = undefined;
    });

    it('maps a single question to an enum schema and returns the answer', async () => {
        presenter({ action: 'accept', content: 'Paris' });
        const res = await askQuestionHandler(call({ question: 'Where?', options: [{ title: 'Paris' }, { title: 'London' }] }), sig());
        expect(lastRequest?.message).toBe('Where?');
        expect(schema().type).toBe('enum');
        expect(schema().options.map((o: any) => o.value)).toEqual(['Paris', 'London']);
        expect(res).toEqual({ toolCallId: 'c1', content: 'Paris' });
    });

    it('accepts the single-element questions[] form as an enum', async () => {
        presenter({ action: 'accept', content: 'react' });
        await askQuestionHandler(call({ questions: [{ question: 'FW?', options: [{ title: 'react' }] }] }), sig());
        expect(schema().type).toBe('enum');
    });

    it('maps several questions to an object (form) schema and flattens the answer', async () => {
        presenter({ action: 'accept', content: { 'A?': 'x', 'B?': 'y' } });
        const res = await askQuestionHandler(call({
            questions: [
                { question: 'A?', options: [{ title: 'x' }] },
                { question: 'B?', options: [{ title: 'y' }] },
            ],
        }), sig());
        expect(schema().type).toBe('object');
        expect(Object.keys(schema().properties)).toEqual(['A?', 'B?']);
        expect(res.content).toBe('A? → x\nB? → y');
    });

    it('decline resolves to a model-usable note', async () => {
        presenter({ action: 'decline' });
        const res = await askQuestionHandler(call({ question: 'q', options: [{ title: 'a' }] }), sig());
        expect(res.content).toBe('The user declined to answer.');
    });

    it('cancel rejects with an AbortError', async () => {
        presenter({ action: 'cancel' });
        await expect(askQuestionHandler(call({ question: 'q', options: [{ title: 'a' }] }), sig()))
            .rejects.toMatchObject({ name: 'AbortError' });
    });

    it('joins multi-select answers into one string', async () => {
        presenter({ action: 'accept', content: ['a', 'b'] });
        const res = await askQuestionHandler(call({ question: 'q', options: [{ title: 'a' }, { title: 'b' }], multiple: true }), sig());
        expect(res.content).toBe('a, b');
    });

    it('honours multiple + allow_other on a question item', async () => {
        presenter({ action: 'decline' });
        await askQuestionHandler(call({
            questions: [{ question: 'Pick', options: [{ title: 'a' }], multiple: true, allow_other: false }],
        }), sig());
        expect(schema().multiple).toBe(true);
        expect(schema().allowOther).toBe(false);
    });

    it('normalises improvised option shapes into enum options', async () => {
        presenter({ action: 'decline' });
        await askQuestionHandler(call({
            questions: [{
                question: 'Which file?',
                options: [
                    { title: 'Invoice' },         // schema-correct
                    { label: 'List' },            // alt key
                    { value: 'Excel' },           // alt key
                    'PlainString',                // bare string
                    { foo: 'Improvised' },        // unknown key → first string field
                    { description: 'no label' },  // no label → dropped
                ],
            }],
        }), sig());
        expect(schema().options.map((o: any) => o.value)).toEqual(['Invoice', 'List', 'Excel', 'PlainString', 'Improvised']);
    });
});
