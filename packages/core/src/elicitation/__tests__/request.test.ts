import { describe, it, expect, afterEach } from 'vitest';
import { AparteConfig, AparteConfigClass } from '../../config/aparte-config';
import { attachConfig } from '../../config/config-context';
import { requestUserInput } from '../index';
import type { AparteElicitationResult } from '../types';

describe('requestUserInput / elicitation presenter', () => {
    afterEach(() => {
        AparteConfig.setElicitationPresenter(null);
        document.body.innerHTML = '';
    });

    it('resolves cancel when no presenter is registered (never hangs)', async () => {
        const res = await AparteConfig.requestUserInput({ message: 'x', schema: { type: 'string' } });
        expect(res).toEqual({ action: 'cancel' });
    });

    it('delegates to the registered presenter and returns its result', async () => {
        const accept: AparteElicitationResult = { action: 'accept', content: 'Paris' };
        AparteConfig.setElicitationPresenter(async () => accept);
        const res = await AparteConfig.requestUserInput({ message: 'Where?', schema: { type: 'string' } });
        expect(res).toBe(accept);
    });

    it('the free function resolves the presenter of the target element instance', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const cfg = new AparteConfigClass();
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
        AparteConfig.setElicitationPresenter(async () => { ran = true; return { action: 'cancel' }; });
        await requestUserInput({ message: 'x', schema: { type: 'string' } });
        expect(ran).toBe(true);
    });

    it('reset() clears the presenter', async () => {
        const c = new AparteConfigClass();
        c.setElicitationPresenter(async () => ({ action: 'accept', content: 1 }));
        c.reset();
        expect(await c.requestUserInput({ message: 'x', schema: { type: 'string' } })).toEqual({ action: 'cancel' });
    });
});
