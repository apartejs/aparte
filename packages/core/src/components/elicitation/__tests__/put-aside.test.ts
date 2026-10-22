// @vitest-environment jsdom
/**
 * An open panel can be put aside, to read the transcript behind it, and brought back.
 *
 * A question or an approval takes the composer over and caps at half the viewport, so the
 * reply it asks about can sit right behind it. Hiding leaves a one-line bar that says an
 * answer is waiting — never nothing — and the request stays open the whole time.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../composer/aparte-composer.js';
import '../../composer/aparte-composer-input.js';
import '../aparte-elicitation.js';
import { aparteGlobalConfig } from '../../../config/aparte-config';
import { requestUserInput } from '../../../elicitation/index';

function mountChat(): void {
    const host = document.createElement('div');
    const composer = document.createElement('aparte-composer');
    composer.appendChild(document.createElement('aparte-composer-input'));
    host.appendChild(composer);
    host.appendChild(document.createElement('aparte-elicitation'));
    document.body.appendChild(host);
}

const panel = (): HTMLElement => document.querySelector<HTMLElement>('.aparte-elic-panel')!;
const hide = (): HTMLButtonElement => panel().querySelector<HTMLButtonElement>('.aparte-elic-dismiss .aparte-elic-hide')!;
const reveal = (): HTMLButtonElement => panel().querySelector<HTMLButtonElement>('.aparte-elic-reveal')!;

afterEach(() => {
    aparteGlobalConfig.setElicitationPresenter(null);
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('putting an open panel aside', () => {
    it('hides a question behind a bar that brings it back, and the question stays open', async () => {
        mountChat();
        let settled = false;
        const p = requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        }).then((r) => { settled = true; return r; });

        // First in the corner, before Skip, so it never swaps places between the two kinds.
        expect(panel().querySelector('.aparte-elic-dismiss')!.firstElementChild).toBe(hide());
        expect(hide().getAttribute('aria-label')).toBe('Hide for now');
        expect(hide().getAttribute('aria-expanded')).toBe('true');

        hide().click();
        expect(panel().hasAttribute('data-collapsed')).toBe(true);
        expect(reveal().textContent).toBe('Waiting for your answer');
        expect(reveal().getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement, 'the focus goes to the bar, not to <body>').toBe(reveal());

        await Promise.resolve();
        expect(settled, 'putting it aside is not an answer').toBe(false);

        reveal().click();
        expect(panel().hasAttribute('data-collapsed')).toBe(false);
        expect(panel().contains(document.activeElement), 'and the panel has the focus again').toBe(true);

        document.querySelector<HTMLButtonElement>('.aparte-elic-option--command')!.click();
        expect(await p).toMatchObject({ action: 'accept' });
    });

    it('offers the same on an approval, whose corner had nothing in it', async () => {
        mountChat();
        const p = requestUserInput({
            kind: 'approval',
            message: 'Run delete_file?',
            options: [{ value: 'allow', label: 'Approve', tone: 'affirm' }, { value: 'deny', label: 'Reject', tone: 'deny' }],
        });
        hide().click();
        expect(panel().hasAttribute('data-collapsed')).toBe(true);
        reveal().click();
        document.querySelector<HTMLButtonElement>('.aparte-approval-option')!.click();
        expect(await p).toEqual({ action: 'accept', content: { option: 'allow' } });
    });

    it('follows a language switch', () => {
        mountChat();
        void requestUserInput({ message: 'Framework?', schema: { type: 'string' } }).catch(() => {});
        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), elicitationHide: 'Masquer', elicitationWaiting: 'En attente' });
        expect(hide().getAttribute('aria-label')).toBe('Masquer');
        expect(reveal().textContent).toBe('En attente');
    });
});
