import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, AparteConfig } from '../../config/aparte-config';
import { attachConfig } from '../../config/config-context';
import { requestUserInput } from '../index';
import type { AparteElicitationResult } from '../types';

describe('requestUserInput / elicitation presenter', () => {
    afterEach(() => {
        aparteGlobalConfig.setElicitationPresenter(null);
        document.body.innerHTML = '';
    });

    it('rejects when no presenter is registered (never hangs, never lies)', async () => {
        // It used to resolve `{ action: 'cancel' }`, which a caller could pass on as an
        // answer — and the approval gate did exactly that.
        await expect(aparteGlobalConfig.requestUserInput({ message: 'x', schema: { type: 'string' } }))
            .rejects.toMatchObject({ name: 'AbortError', reason: 'no-presenter' });
    });

    it('delegates to the registered presenter and returns its result', async () => {
        const accept: AparteElicitationResult = { action: 'accept', content: 'Paris' };
        aparteGlobalConfig.setElicitationPresenter(async () => accept);
        const res = await aparteGlobalConfig.requestUserInput({ message: 'Where?', schema: { type: 'string' } });
        expect(res).toBe(accept);
    });

    it('the free function resolves the presenter of the target element instance', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const cfg = new AparteConfig();
        let seen: string | undefined;
        cfg.setElicitationPresenter(async (req) => { seen = req.message; return { action: 'decline' }; });
        attachConfig(host, cfg);

        const child = document.createElement('span');
        host.appendChild(child);

        const res = await requestUserInput({ message: 'scoped?', schema: { type: 'boolean' }, target: child });
        expect(seen).toBe('scoped?');            // the INSTANCE presenter ran, not the global
        expect(res).toEqual({ action: 'decline' });
    });

    it('a request with no target falls back to the global config presenter', async () => {
        let ran = false;
        aparteGlobalConfig.setElicitationPresenter(async () => { ran = true; return { action: 'decline' }; });
        await requestUserInput({ message: 'x', schema: { type: 'string' } });
        expect(ran).toBe(true);
    });

    /*
     * The queue. One request reaches the presenter at a time, because the composer has
     * one panel slot — and a second request WAITS rather than being answered `cancel`
     * on arrival, which is a refusal invented for a question nobody was ever shown.
     *
     * A custom presenter, deliberately: the default one has its own abort check, so a
     * test through it cannot tell whether the queue did its job. This is also the seam
     * that previously had no protection at all.
     */
    it('hands one request to the presenter at a time', async () => {
        const seen: string[] = [];
        let release: (() => void) | undefined;
        const c = new AparteConfig();
        c.setElicitationPresenter(async (req) => {
            seen.push(req.message);
            if (req.message === 'first') await new Promise<void>((r) => { release = r; });
            return { action: 'decline' };
        });

        const first = c.requestUserInput({ message: 'first', schema: { type: 'string' } });
        const second = c.requestUserInput({ message: 'second', schema: { type: 'string' } });

        // The second has not been shown, and has not been answered either.
        expect(seen).toEqual(['first']);

        release!();
        await first;
        await second;
        expect(seen, 'the second is presented once the first has settled').toEqual(['first', 'second']);
    });

    it('does not present a queued request whose turn was stopped while it waited', async () => {
        const seen: string[] = [];
        let release: (() => void) | undefined;
        const c = new AparteConfig();
        c.setElicitationPresenter(async (req) => {
            seen.push(req.message);
            if (req.message === 'first') await new Promise<void>((r) => { release = r; });
            return { action: 'decline' };
        });

        const first = c.requestUserInput({ message: 'first', schema: { type: 'string' } });
        const ac = new AbortController();
        const second = c.requestUserInput({ message: 'second', schema: { type: 'string' }, signal: ac.signal });

        // Stopped while still in the queue. Asking now would be asking about a run
        // that is already over.
        ac.abort();
        release!();
        await first;

        await expect(second).rejects.toMatchObject({ name: 'AbortError', reason: 'aborted' });
        expect(seen, 'the presenter must never see it').toEqual(['first']);
    });

    it('the queue drains, so a later request is presented in the same tick again', async () => {
        // Not a micro-optimisation: the panel is mounted synchronously today and both
        // the unit tests and the browser E2E read it on the next line. A tail left
        // behind would push every subsequent request onto a microtask.
        const c = new AparteConfig();
        const seen: string[] = [];
        c.setElicitationPresenter((req) => { seen.push(req.message); return Promise.resolve({ action: 'decline' } as const); });

        await c.requestUserInput({ message: 'one', schema: { type: 'string' } });
        // A macrotask, because the tail clears two microtasks AFTER the request it
        // belongs to settles — awaiting the request itself is one hop too early, and a
        // test that pretended otherwise would be asserting the implementation's
        // scheduling rather than its guarantee.
        await new Promise((r) => setTimeout(r, 0));

        c.requestUserInput({ message: 'two', schema: { type: 'string' } });
        expect(seen, 'a drained queue presents in the calling tick again').toEqual(['one', 'two']);
    });

    it('reset() clears the presenter', async () => {
        const c = new AparteConfig();
        c.setElicitationPresenter(async () => ({ action: 'accept', content: 1 }));
        c.reset();
        await expect(c.requestUserInput({ message: 'x', schema: { type: 'string' } }))
            .rejects.toMatchObject({ name: 'AbortError', reason: 'no-presenter' });
    });
});
