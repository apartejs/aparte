// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, AparteConfig, attachConfig } from '@aparte/core';
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

    it('each question requires BOTH a question string and 2 to 6 options', () => {
        // `options` used to be optional with no `minItems`, so a call carrying only
        // `{question, allow_other: true}` was schema-valid — and a local model made
        // exactly that call. The panel then rendered a radio list whose single entry
        // was "Other…". The 2–6 range was stated in the system prompt, in prose; a
        // small model reads the schema.
        const schema = askQuestionTool.inputSchema as any;
        const item = schema.properties.questions.items;
        expect(item.required).toContain('question');
        expect(item.required).toContain('options');
        expect(item.properties.options.minItems).toBe(2);
        // FOUR: six options plus the free-text escape is seven rows in a composer,
        // and it looked like a form that had escaped into a chat. A model asked for
        // four also writes better options than one asked for six — it has to choose.
        expect(item.properties.options.maxItems).toBe(4);
    });
});

describe('askQuestionHandler — elicitation adapter', () => {
    let lastRequest: AparteElicitationRequest | undefined;
    const sig = () => new AbortController().signal;
    const call = (input: Record<string, unknown>) => ({ id: 'c1', name: 'ask_question', input });

    /** Register a scripted presenter and capture the request it receives. */
    function presenter(result: AparteElicitationResult): void {
        aparteGlobalConfig.setElicitationPresenter(async (req) => { lastRequest = req; return result; });
    }
    const schema = () => lastRequest!.schema as any;

    afterEach(() => {
        aparteGlobalConfig.setElicitationPresenter(null);
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

    /**
     * The call a real model actually made, reproduced.
     *
     * `ask_question(questions=[{question: "Quelle est ta couleur préférée ?",
     * allow_other: true}, {…}])` — no options at all. The schema now forbids that,
     * but a model ignoring the schema is the normal case, and the old adapter built
     * `{type: 'enum', options: []}`, which the panel rendered as a radio list whose
     * only entry was "Other…". Selecting a radio to reveal the text box you needed
     * all along is a worse text box.
     */
    it('a question the model sent with NO options becomes a labelled text field', async () => {
        presenter({ action: 'accept', content: { q1: 'bleu', q2: 'ronde' } });
        const res = await askQuestionHandler(call({
            questions: [
                { question: 'Quelle est ta couleur préférée ?', allow_other: true },
                { question: 'Quelle est ta forme préférée ?', allow_other: true },
            ],
        }), sig());

        const props = schema().properties as any;
        expect(props['q1'].type, 'no options is not a choice — it is a text answer').toBe('string');
        expect(props['q1'].title).toBe('Quelle est ta couleur préférée ?');
        expect(props['q2'].type).toBe('string');
        // And the model still reads which question each answer belongs to.
        expect(res.content).toContain('Quelle est ta couleur préférée ? → bleu');
    });

    it('a single question with no options is a text field too', async () => {
        presenter({ action: 'accept', content: 'anything' });
        await askQuestionHandler(call({ question: 'Ton prénom ?' }), sig());
        expect(schema().type).toBe('string');
        expect(schema().title).toBe('Ton prénom ?');
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
        // STABLE keys, not the question text. The text used to be the property key,
        // so two identically-worded questions collapsed into one field and a long
        // question became a long key. It now travels as the field's `title` — and
        // the answer assertion below proves the model still reads the question
        // rather than `q1`.
        expect(Object.keys(schema().properties)).toEqual(['q1', 'q2']);
        expect((schema().properties as any)['q1'].title).toBe('A?');
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

    it('honours multiple, and IGNORES a model-sent allow_other', async () => {
        presenter({ action: 'decline' });
        await askQuestionHandler(call({
            questions: [{ question: 'Pick', options: [{ title: 'a' }], multiple: true, allow_other: false }],
        }), sig());

        expect(schema().multiple, 'multi-select is a property of the question').toBe(true);
        // Whether a choice offers a free-text escape is the HOST's decision —
        // `setElicitationOptions({ allowOther })` — so the field is left unset and the
        // panel falls back to that policy. It used to be in the schema handed to the
        // model, which is how a small model came to send `allow_other: true` with no
        // options at all and get a radio list whose only entry was "Other…". A model
        // still sending it is ignored rather than rejected, so no existing call breaks.
        expect(schema().allowOther, 'the model does not decide the UX').toBeUndefined();
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

describe('the handler asks the RIGHT chat', () => {
    afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

    /**
     * A handler used to have no way to know which chat it was running for, so this
     * plugin called `requestUserInput` with no `target`. That resolved the presenter
     * from the GLOBAL config — so a chat given its own `config`, with its own
     * presenter, received `{ action: 'cancel' }` and the model was told the user had
     * refused a question the user was never shown.
     */
    const chatUnderInstanceConfig = (): { el: HTMLElement; cfg: AparteConfig; asked: string[] } => {
        const host = document.createElement('div');
        const el = document.createElement('div');
        host.appendChild(el);
        document.body.appendChild(host);
        const cfg = new AparteConfig();
        attachConfig(host, cfg);
        const asked: string[] = [];
        cfg.setElicitationPresenter(async (req: AparteElicitationRequest): Promise<AparteElicitationResult> => {
            asked.push(req.message);
            return { action: 'accept', content: 'staging' };
        });
        return { el, cfg, asked };
    };

    it('reaches the instance presenter when given the context', async () => {
        const { el, asked } = chatUnderInstanceConfig();
        const result = await askQuestionHandler(
            { id: 't1', name: 'ask_question', input: { question: 'Which environment?', options: ['staging'] } },
            new AbortController().signal,
            { target: el },
        );
        expect(asked, 'the instance presenter was never asked').toHaveLength(1);
        expect(result.content).toContain('staging');
    });

    it('without the context it falls back to the global — the old behaviour', async () => {
        const { asked } = chatUnderInstanceConfig();
        // No presenter on the global config, so this resolves `cancel`, which this
        // handler turns into an AbortError. Asserted so the fix's value is explicit:
        // the ONLY thing that changed is that the context now exists.
        await expect(askQuestionHandler(
            { id: 't2', name: 'ask_question', input: { question: 'Which environment?', options: ['staging'] } },
            new AbortController().signal,
        )).rejects.toThrow();
        expect(asked, 'the instance presenter must not be reached without a target').toHaveLength(0);
    });
});
