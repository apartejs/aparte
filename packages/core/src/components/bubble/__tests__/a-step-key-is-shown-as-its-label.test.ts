// @vitest-environment jsdom
/**
 * A step a server names with a key is shown as the label the app registered for it.
 *
 * `step-start { name: 'reread' }` carries a stable key and the page knows the person's
 * language, so the waiting indicator shows what `registerStepLabel` maps the key to — to the
 * eye, and to a screen reader, which hears it in place of "Typing". A name nobody labelled is
 * shown as it always was: itself. The label is read from the chat's own config, at every draw,
 * so a registration, an unregistration and a language switch change what an open step says.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig, AparteConfig, attachConfig, APARTE_DEFAULT_LOCALE } from '../../../config/index.js';
import type { AparteStepLabelContext } from '../../../config/index.js';

type BubbleEl = HTMLElement & { setStep(name: string | null): void; getSegments(): unknown[] };

function streamingBubble(parent: HTMLElement = document.body): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', 'a1');
    el.setAttribute('streaming', '');
    parent.appendChild(el);
    return el;
}

const waiting = (el: HTMLElement) => el.querySelector<HTMLElement>('.aparte-waiting')!;
/** The step's words as the reader sees them: '' when none shows. */
const shown = (el: HTMLElement): string => {
    const step = waiting(el).querySelector<HTMLElement>('.aparte-waiting-step');
    return !waiting(el).hidden && step && !step.hidden ? step.textContent ?? '' : '';
};
const spoken = (el: HTMLElement) => waiting(el).querySelector('.aparte-sr-only')!.textContent;

const FR = { ...APARTE_DEFAULT_LOCALE, tag: 'fr-FR', typing: 'Écrit…' };
const restoring = ({ locale }: AparteStepLabelContext): string =>
    locale.tag === 'fr-FR' ? 'Reprise de la mémoire…' : 'Restoring the memory…';

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('a step shown as its label', () => {
    it('shows the label in place of the key, to the eye and to a screen reader', () => {
        aparteGlobalConfig.registerStepLabel('reread', 'Re-reading the conversation');
        const el = streamingBubble();
        el.setStep('reread');
        expect(shown(el)).toBe('Re-reading the conversation');
        expect(spoken(el)).toBe('Re-reading the conversation');
        expect(waiting(el).querySelector('.aparte-dots')).not.toBeNull();
    });

    it('shows a name nobody labelled as it always did, itself', () => {
        aparteGlobalConfig.registerStepLabel('reread', 'Re-reading the conversation');
        const el = streamingBubble();
        el.setStep('Reading the parser');
        expect(shown(el)).toBe('Reading the parser');
        expect(spoken(el)).toBe('Reading the parser');
    });

    it('follows the step, a label then a name then a label', () => {
        aparteGlobalConfig.registerStepLabel('restore', 'Restoring the memory');
        const el = streamingBubble();
        el.setStep('restore');
        expect(shown(el)).toBe('Restoring the memory');
        el.setStep('Planning');
        expect(shown(el)).toBe('Planning');
        el.setStep('restore');
        expect(shown(el)).toBe('Restoring the memory');
        el.setStep(null);
        expect(shown(el)).toBe('');
        expect(spoken(el)).toBe(aparteGlobalConfig.getLocale().typing);
    });

    it('a function label follows a language switch, on screen and for a screen reader', () => {
        aparteGlobalConfig.registerStepLabel('restore', restoring);
        const el = streamingBubble();
        el.setStep('restore');
        expect(shown(el)).toBe('Restoring the memory…');

        aparteGlobalConfig.setLocale(FR);
        expect(shown(el)).toBe('Reprise de la mémoire…');
        expect(spoken(el)).toBe('Reprise de la mémoire…');

        aparteGlobalConfig.resetLocale();
        expect(shown(el)).toBe('Restoring the memory…');
        expect(spoken(el)).toBe('Restoring the memory…');
    });

    it('a label registered while the step shows reaches it, and taking it off gives the key back', () => {
        const el = streamingBubble();
        el.setStep('reread');
        expect(shown(el)).toBe('reread');

        const off = aparteGlobalConfig.registerStepLabel('reread', 'Re-reading the conversation');
        expect(shown(el)).toBe('Re-reading the conversation');
        expect(spoken(el)).toBe('Re-reading the conversation');

        off();
        expect(shown(el)).toBe('reread');
        expect(spoken(el)).toBe('reread');
    });

    it('a label that throws or says nothing shows the key', () => {
        aparteGlobalConfig.registerStepLabel('boom', () => { throw new Error('boom'); });
        aparteGlobalConfig.registerStepLabel('blank', () => '  ');
        const el = streamingBubble();
        el.setStep('boom');
        expect(shown(el)).toBe('boom');
        el.setStep('blank');
        expect(shown(el)).toBe('blank');
    });

    it('is words on the indicator and nothing of the message: no segment holds the key or the label', () => {
        aparteGlobalConfig.registerStepLabel('reread', 'Re-reading the conversation');
        const el = streamingBubble();
        el.setStep('reread');
        expect(el.getSegments()).toEqual([]);
        expect(el.querySelector('.aparte-segments')!.textContent).toBe('');
    });
});

describe('a chat with a config of its own', () => {
    function chatWith(own: AparteConfig): BubbleEl {
        const host = document.createElement('div');
        document.body.appendChild(host);
        attachConfig(host, own);
        return streamingBubble(host);
    }

    it('shows its own label, not the page\'s, while a bubble outside it shows the page\'s', () => {
        aparteGlobalConfig.registerStepLabel('reread', 'The page\'s words');
        const own = new AparteConfig();
        own.registerStepLabel('reread', 'The chat\'s words');
        const inside = chatWith(own);
        const outside = streamingBubble();
        inside.setStep('reread');
        outside.setStep('reread');
        expect(shown(inside)).toBe('The chat\'s words');
        expect(spoken(inside)).toBe('The chat\'s words');
        expect(shown(outside)).toBe('The page\'s words');
    });

    it('is relabelled by its own config\'s changes, and not by another chat\'s', () => {
        const own = new AparteConfig();
        const other = new AparteConfig();
        const inside = chatWith(own);
        inside.setStep('reread');
        expect(shown(inside)).toBe('reread');

        other.registerStepLabel('reread', 'Another chat\'s words');
        expect(shown(inside)).toBe('reread');

        own.registerStepLabel('reread', 'Re-reading the conversation');
        expect(shown(inside)).toBe('Re-reading the conversation');
        expect(spoken(inside)).toBe('Re-reading the conversation');
    });

    it('a function label follows the language switch of the chat\'s own config', () => {
        const own = new AparteConfig();
        own.registerStepLabel('restore', restoring);
        const inside = chatWith(own);
        inside.setStep('restore');
        expect(shown(inside)).toBe('Restoring the memory…');
        own.setLocale(FR);
        expect(shown(inside)).toBe('Reprise de la mémoire…');
        expect(spoken(inside)).toBe('Reprise de la mémoire…');
    });

    it('draws a step that is showing with the config it is given afterwards', async () => {
        aparteGlobalConfig.registerStepLabel('reread', 'The page\'s words');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const el = streamingBubble(host);
        el.setStep('reread');
        expect(shown(el)).toBe('The page\'s words');

        // Under every wrapper the chat's config is attached after its first bubbles are drawn.
        const own = new AparteConfig();
        own.registerStepLabel('reread', 'The chat\'s words');
        attachConfig(host, own);
        await Promise.resolve();
        expect(shown(el)).toBe('The chat\'s words');
        expect(spoken(el)).toBe('The chat\'s words');
    });
});
