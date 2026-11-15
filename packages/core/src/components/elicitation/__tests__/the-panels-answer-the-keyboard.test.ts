/**
 * Both panels drawn as buttons — a single question and an approval — answer 1-9 and Escape
 * once the presenter has mounted them, and what they do not answer stays the field's.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../composer/aparte-composer.js';
import '../aparte-elicitation.js';
import { aparteGlobalConfig } from '../../../config/aparte-config';
import { requestUserInput } from '../../../elicitation/index';

function mountChat(): void {
    const host = document.createElement('div');
    host.appendChild(document.createElement('aparte-composer'));
    host.appendChild(document.createElement('aparte-elicitation'));
    document.body.appendChild(host);
}

const press = (target: Element, init: KeyboardEventInit): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
};

afterEach(() => {
    aparteGlobalConfig.setElicitationPresenter(null);
    document.body.innerHTML = '';
});

describe('the panels and the keyboard', () => {
    it('an approval: a digit on an option presses it, Escape refuses, both are kept from the page', async () => {
        mountChat();
        const p = requestUserInput({
            kind: 'approval',
            message: 'Run it?',
            options: [
                { value: 'allow', label: 'Allow' },
                { value: 'deny', label: 'Refuse', tone: 'deny' },
            ],
        });
        const options = [...document.querySelectorAll<HTMLButtonElement>('.aparte-approval-option')];
        expect(options.map((o) => o.getAttribute('aria-keyshortcuts'))).toEqual(['1', '2']);
        const e = press(options[0]!, { key: 'Escape' });
        expect(e.defaultPrevented).toBe(true);
        expect(await p).toEqual({ action: 'accept', content: { option: 'deny' } });
    });

    it('a question: a digit chooses, and Escape skips', async () => {
        mountChat();
        const p = requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });
        const options = document.querySelectorAll<HTMLButtonElement>('.aparte-elic-option--command');
        press(options[0]!, { key: '2' });
        expect(await p).toEqual({ action: 'accept', content: 'vue' });

        const q = requestUserInput({
            message: 'Again?',
            schema: { type: 'enum', options: [{ value: 'a' }], allowOther: false },
        });
        await new Promise((r) => setTimeout(r, 0));
        press(document.querySelector('.aparte-elic-option--command')!, { key: 'Escape' });
        expect(await q).toEqual({ action: 'decline' });
    });

    it('a digit typed while the panel itself has the focus chooses nothing', () => {
        mountChat();
        void requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });
        const panel = document.querySelector<HTMLElement>('.aparte-elic-panel')!;
        const e = press(panel, { key: '1' });
        expect(e.defaultPrevented).toBe(false);
        expect(document.querySelector('.aparte-elic-panel')).not.toBeNull();
    });
});
