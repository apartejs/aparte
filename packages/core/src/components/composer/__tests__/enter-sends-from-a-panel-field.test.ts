// @vitest-environment jsdom
/**
 * Enter in a panel's one-line field presses the composer's button.
 *
 * A panel has no button of its own: what a person writes in it goes out through the
 * composer's, which already means "send". Enter did not follow. A panel takes the editor's
 * place and the editor is the only thing that listened for the key, so someone who typed
 * "no, make it Friday" and pressed Enter, as they do everywhere else in the chat, got a new
 * line in the approval's field and nothing sent; in a question's text box, nothing at all.
 *
 * Driven through `requestUserInput` and a real composer rather than a stand-in, because the
 * gates that matter (the panel's mode, an empty field, a panel put aside) live on that path.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';
import '../../elicitation/aparte-elicitation.js';
import { aparteGlobalConfig } from '../../../config/aparte-config';
import { requestUserInput } from '../../../elicitation/index';

function mountChat(attrs: Record<string, string> = {}): HTMLElement {
    const host = document.createElement('div');
    const composer = document.createElement('aparte-composer');
    for (const [name, value] of Object.entries(attrs)) composer.setAttribute(name, value);
    composer.appendChild(document.createElement('aparte-composer-input'));
    host.appendChild(composer);
    host.appendChild(document.createElement('aparte-elicitation'));
    document.body.appendChild(host);
    return composer;
}

const OPTIONS = [
    { value: 'allow', label: 'Approve', tone: 'affirm' as const },
    { value: 'deny', label: 'Reject', tone: 'deny' as const },
];

/** Press a key on a field; answers whether the browser's own effect was cancelled. */
function press(field: HTMLElement, init: KeyboardEventInit = {}): boolean {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
    field.dispatchEvent(event);
    return event.defaultPrevented;
}

function write(field: HTMLInputElement | HTMLTextAreaElement, text: string): void {
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
}

function watch<T>(p: Promise<T>): { settled: () => boolean; answer: Promise<T> } {
    let done = false;
    const answer = p.then((r) => { done = true; return r; });
    // A request still open when the test ends is aborted by the teardown, which is not a failure.
    answer.catch(() => undefined);
    return { settled: () => done, answer };
}

const approval = () => watch(requestUserInput({ kind: 'approval', message: 'Run add_task?', options: OPTIONS }));
const instructionField = () => document.querySelector<HTMLTextAreaElement>('.aparte-approval-instruction')!;

afterEach(() => {
    aparteGlobalConfig.setElicitationPresenter(null);
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('Enter in a panel field', () => {
    it("sends an approval's written instruction, and adds no line", async () => {
        mountChat();
        const { answer } = approval();
        write(instructionField(), 'no, make it Friday');

        expect(press(instructionField()), 'no newline goes into the field').toBe(true);
        expect(await answer).toEqual({ action: 'accept', content: { instruction: 'no, make it Friday' } });
    });

    it('sends a question\'s text answer', async () => {
        mountChat();
        const { answer } = watch(requestUserInput({ message: 'Name?', schema: { type: 'string' } }));
        const field = document.querySelector<HTMLInputElement>('.aparte-elic-text')!;
        write(field, 'Ada');

        press(field);
        expect(await answer).toEqual({ action: 'accept', content: 'Ada' });
    });

    it('sends what was written in a question\'s "Other…" field', async () => {
        mountChat();
        const { answer } = watch(requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: true },
        }));
        document.querySelector<HTMLButtonElement>('.aparte-elic-option--other')!.click();
        const field = document.querySelector<HTMLInputElement>('.aparte-elic-other-input')!;
        write(field, 'Solid');

        press(field);
        expect(await answer).toEqual({ action: 'accept', content: 'Solid' });
    });

    it('sends nothing from an empty field, and still adds no line to it', async () => {
        mountChat();
        const { settled } = approval();

        expect(press(instructionField())).toBe(true);
        await Promise.resolve();
        expect(settled()).toBe(false);
        expect(document.querySelector('.aparte-elic-panel'), 'the question stays open').not.toBeNull();
    });

    it('leaves Shift+Enter to the field, for a second line', async () => {
        mountChat();
        const { settled } = approval();
        write(instructionField(), 'first line');

        expect(press(instructionField(), { shiftKey: true }), 'the browser inserts the line').toBe(false);
        await Promise.resolve();
        expect(settled()).toBe(false);
    });

    it('never sends on the Enter that confirms an IME candidate', async () => {
        mountChat();
        const { settled } = approval();
        write(instructionField(), '金曜日に');

        expect(press(instructionField(), { isComposing: true })).toBe(false);
        expect(press(instructionField(), { keyCode: 229 } as KeyboardEventInit)).toBe(false);
        await Promise.resolve();
        expect(settled()).toBe(false);
    });

    it('follows submit-on-enter="false": Enter is the line, Shift+Enter sends', async () => {
        mountChat({ 'submit-on-enter': 'false' });
        const { settled, answer } = approval();
        write(instructionField(), 'no, make it Friday');

        expect(press(instructionField()), 'a bare Enter stays the browser\'s').toBe(false);
        await Promise.resolve();
        expect(settled()).toBe(false);

        expect(press(instructionField(), { shiftKey: true })).toBe(true);
        expect(await answer).toEqual({ action: 'accept', content: { instruction: 'no, make it Friday' } });
    });

    it('leaves a multi-line answer alone: Enter there is the next line', async () => {
        mountChat();
        const { settled } = watch(requestUserInput({ message: 'Notes?', schema: { type: 'string', multiline: true } }));
        const field = document.querySelector<HTMLTextAreaElement>('.aparte-elic-text')!;
        write(field, 'first line');

        expect(press(field)).toBe(false);
        await Promise.resolve();
        expect(settled()).toBe(false);
    });

    it('sends nothing while the panel is put aside', async () => {
        mountChat();
        const { settled } = approval();
        write(instructionField(), 'no, make it Friday');
        document.querySelector<HTMLButtonElement>('.aparte-elic-dismiss .aparte-elic-hide')!.click();

        press(instructionField());
        await Promise.resolve();
        expect(settled()).toBe(false);
    });

    it("leaves a key a panel's own field has already handled", async () => {
        const composer = mountChat() as HTMLElement & { showPanel(el: HTMLElement, o?: object): symbol };
        let sent = 0;
        const panel = document.createElement('div');
        const combobox = document.createElement('input');
        combobox.type = 'text';
        combobox.addEventListener('keydown', (e) => e.preventDefault());
        panel.appendChild(combobox);
        composer.showPanel(panel, { submitEnabled: true, onSubmit: () => { sent++; } });

        press(combobox);
        expect(sent).toBe(0);
    });

    it('does not take Enter from a choice or a button in the panel', () => {
        const composer = mountChat() as HTMLElement & { showPanel(el: HTMLElement, o?: object): symbol };
        let sent = 0;
        const panel = document.createElement('div');
        const radio = document.createElement('input');
        radio.type = 'radio';
        const button = document.createElement('button');
        panel.append(radio, button);
        composer.showPanel(panel, { submitEnabled: true, onSubmit: () => { sent++; } });

        expect(press(radio)).toBe(false);
        expect(press(button), 'Enter on a button is that button').toBe(false);
        expect(sent).toBe(0);
    });
});
