// @vitest-environment jsdom
/**
 * A chip sends its own text and nothing else.
 *
 * The composer's `submit()` means three things: send, stop the reply, answer the open question.
 * A chip a model wrote (a ```suggestions block) must mean the first only: beside an `ask_user`
 * panel with a preselected option, it used to send that option as the person's own answer, and
 * during a reply it stopped the reply. It also took the draft and the staged files with it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../../composer/aparte-composer.js';
import '../aparte-suggestions.js';
import type { AparteComposer } from '../../composer/aparte-composer.js';
import type { AparteSuggestions } from '../aparte-suggestions.js';

function mount(mode?: string): { composer: AparteComposer; chip: HTMLButtonElement; sent: Array<{ content: string; files?: File[] }> } {
    document.body.innerHTML = `<aparte-composer><aparte-suggestions suggestions='["No, cancel"]'${mode ? ` mode="${mode}"` : ''}></aparte-suggestions></aparte-composer>`;
    const composer = document.querySelector('aparte-composer') as AparteComposer;
    const sent: Array<{ content: string; files?: File[] }> = [];
    composer.addEventListener('aparte-send', (e) => sent.push((e as CustomEvent).detail));
    const chip = (document.querySelector('aparte-suggestions') as AparteSuggestions).querySelector('button')!;
    return { composer, chip, sent };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('a chip beside the composer', () => {
    it('does not answer the question a panel holds, with the option the model preselected', () => {
        const { composer, chip, sent } = mount();
        const answered = vi.fn();
        composer.showPanel(document.createElement('div'), { submitEnabled: true, mode: 'submit', onSubmit: answered });
        chip.click();
        expect(answered).not.toHaveBeenCalled();
        expect(sent).toEqual([]);
    });

    it('does not stop a reply that is streaming', () => {
        const { composer, chip, sent } = mount();
        window.dispatchEvent(new CustomEvent('aparte-message-start'));
        expect(composer.streaming).toBe(true);
        const aborted = vi.fn();
        window.addEventListener('aparte-abort', aborted);
        chip.click();
        window.removeEventListener('aparte-abort', aborted);
        expect(sent).toEqual([]);
        expect(aborted).not.toHaveBeenCalled();
    });

    it('leaves the draft where it was and keeps the staged files out of its message', () => {
        const { composer, chip, sent } = mount();
        const file = new File(['x'], 'plan.txt');
        composer.setValue('half a sentence');
        composer.addAttachments([file]);
        chip.click();
        expect(sent).toHaveLength(1);
        expect(sent[0]!.content).toBe('No, cancel');
        expect(sent[0]!.files).toBeUndefined();
        expect(composer.value).toBe('half a sentence');
        expect(composer.attachments).toEqual([file]);
    });

    it('still sends when nothing else is going on', () => {
        const { chip, sent } = mount();
        chip.click();
        expect(sent.map((s) => s.content)).toEqual(['No, cancel']);
    });
});

describe('a chip the composer refuses leaves nothing behind', () => {
    it('leaves the field empty when the composer is disabled', () => {
        const { composer, chip, sent } = mount();
        composer.setAttribute('disabled', '');
        chip.click();
        expect(sent).toEqual([]);
        expect(composer.value).toBe('');
        composer.removeAttribute('disabled');
        composer.submit();
        expect(sent).toEqual([]);
    });

    it('keeps the draft when the composer is disabled and a file is staged', () => {
        const { composer, chip, sent } = mount();
        const file = new File(['x'], 'a.png');
        composer.addAttachments([file]);
        composer.setAttribute('disabled', '');
        chip.click();
        expect(sent).toEqual([]);
        expect(composer.value).toBe('');
        expect(composer.attachments).toEqual([file]);
    });

    it('leaves the field empty while a model must be chosen first', async () => {
        const { aparteGlobalConfig } = await import('../../../config/index.js');
        aparteGlobalConfig.setRequireModelSelection(true);
        try {
            const { composer, chip, sent } = mount();
            chip.click();
            expect(sent).toEqual([]);
            expect(composer.value).toBe('');
        } finally {
            aparteGlobalConfig.setRequireModelSelection(false);
        }
    });
});

describe('a second chip does not send while the first one is on its way', () => {
    function mountRow(): { chips: HTMLButtonElement[]; sent: string[] } {
        document.body.innerHTML = `<aparte-composer><aparte-suggestions suggestions='["Yes", "No"]'></aparte-suggestions></aparte-composer>`;
        const composer = document.querySelector('aparte-composer') as AparteComposer;
        const sent: string[] = [];
        composer.addEventListener('aparte-send', (e) => sent.push((e as CustomEvent<{ content: string }>).detail.content));
        return { chips: [...document.querySelectorAll<HTMLButtonElement>('aparte-suggestions button')], sent };
    }

    it('sends once for two quick clicks, before the client has announced the turn', () => {
        const { chips, sent } = mountRow();
        chips[0]!.click();
        chips[1]!.click();
        expect(sent).toEqual(['Yes']);
    });

    it('lets the next chip send once the turn has started and is over', () => {
        const { chips, sent } = mountRow();
        chips[0]!.click();
        window.dispatchEvent(new CustomEvent('aparte-message-start'));
        window.dispatchEvent(new CustomEvent('aparte-message-done'));
        chips[1]!.click();
        expect(sent).toEqual(['Yes', 'No']);
    });

    it('lets the next chip send when nothing ever answered the first', () => {
        vi.useFakeTimers();
        try {
            const { chips, sent } = mountRow();
            chips[0]!.click();
            vi.advanceTimersByTime(1100);
            chips[1]!.click();
            expect(sent).toEqual(['Yes', 'No']);
        } finally {
            vi.useRealTimers();
        }
    });
});
