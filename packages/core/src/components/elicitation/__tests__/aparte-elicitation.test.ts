import { describe, it, expect, afterEach } from 'vitest';
import '../../composer/aparte-composer.js';
import '../aparte-elicitation.js';
import { AparteConfig } from '../../../config/aparte-config';
import { requestUserInput } from '../../../elicitation/index';

type ComposerEl = HTMLElement & { submit(): void };

function mountChat(withComposer = true): { composer: ComposerEl | null } {
    const host = document.createElement('div');
    let composer: ComposerEl | null = null;
    if (withComposer) {
        composer = document.createElement('aparte-composer') as ComposerEl;
        host.appendChild(composer);
    }
    host.appendChild(document.createElement('aparte-elicitation'));
    document.body.appendChild(host);
    return { composer };
}

function pick(value: string): void {
    const input = document.querySelector<HTMLInputElement>(`.aparte-elic-panel input[value="${value}"]`)!;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('<aparte-elicitation> presenter', () => {
    afterEach(() => {
        AparteConfig.setElicitationPresenter(null);
        document.body.innerHTML = '';
    });

    it('registers as the presenter on connect', () => {
        mountChat();
        expect(AparteConfig.getElicitationPresenter()).toBeTypeOf('function');
    });

    it('presents an enum request and resolves accept on submit', async () => {
        const { composer } = mountChat();
        const p = requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });
        // Panel mounted synchronously into the composer.
        expect(document.querySelector('.aparte-elic-panel')).not.toBeNull();
        pick('vue');
        composer!.submit(); // send button → panel onSubmit
        expect(await p).toEqual({ action: 'accept', content: 'vue' });
        // Panel removed after settling.
        expect(document.querySelector('.aparte-elic-panel')).toBeNull();
    });

    it('resolves a boolean request', async () => {
        const { composer } = mountChat();
        const p = requestUserInput({ message: 'Proceed?', schema: { type: 'boolean' } });
        pick('true');
        composer!.submit();
        expect(await p).toEqual({ action: 'accept', content: true });
    });

    it('resolves decline via the Skip affordance', async () => {
        mountChat();
        const p = requestUserInput({ message: '?', schema: { type: 'string' } });
        document.querySelector<HTMLButtonElement>('.aparte-elic-skip')!.click();
        expect(await p).toEqual({ action: 'decline' });
    });

    it('resolves cancel when the assistant turn is aborted', async () => {
        mountChat();
        const p = requestUserInput({ message: '?', schema: { type: 'string' } });
        window.dispatchEvent(new CustomEvent('apartemessageaborted'));
        expect(await p).toEqual({ action: 'cancel' });
    });

    it('resolves cancel when there is no composer to present in', async () => {
        mountChat(false);
        expect(await requestUserInput({ message: '?', schema: { type: 'string' } })).toEqual({ action: 'cancel' });
    });

    it('resolves cancel when the caller aborts via signal (tool timeout / turn abort)', async () => {
        mountChat();
        const ctrl = new AbortController();
        const p = requestUserInput({ message: '?', schema: { type: 'string' }, signal: ctrl.signal });
        expect(document.querySelector('.aparte-elic-panel')).not.toBeNull();
        ctrl.abort();
        expect(await p).toEqual({ action: 'cancel' });
        expect(document.querySelector('.aparte-elic-panel')).toBeNull();
    });

    it('resolves cancel immediately for an already-aborted signal', async () => {
        mountChat();
        expect(await requestUserInput({
            message: '?', schema: { type: 'string' }, signal: AbortSignal.abort(),
        })).toEqual({ action: 'cancel' });
    });

    it('declines a second concurrent request while one is open', async () => {
        const { composer } = mountChat();
        const first = requestUserInput({ message: 'first', schema: { type: 'string' } });
        const second = await requestUserInput({ message: 'second', schema: { type: 'string' } });
        expect(second).toEqual({ action: 'cancel' });
        // The first is still open and resolvable.
        document.querySelector<HTMLButtonElement>('.aparte-elic-skip')!.click();
        expect(await first).toEqual({ action: 'decline' });
        void composer;
    });

    it('clears the presenter on disconnect', () => {
        const host = document.createElement('div');
        const elic = document.createElement('aparte-elicitation');
        host.appendChild(elic);
        document.body.appendChild(host);
        expect(AparteConfig.getElicitationPresenter()).toBeTypeOf('function');
        elic.remove();
        expect(AparteConfig.getElicitationPresenter()).toBeUndefined();
    });
});
