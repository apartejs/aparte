/**
 * A client that never started has no listener to remove, so stopping it touches no `window`.
 *
 * The constructor prepares the send handler (without listening), and `stop()` returned early
 * only when there was no handler — so it always reached `window.removeEventListener`. On a
 * server that is a ReferenceError: Svelte runs `onDestroy` at the end of a server render, and
 * a SvelteKit page that started a client the documented way failed with a 500.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteClient } from '../aparte-client.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('AparteClient.stop() before start()', () => {
    it('removes no listener from window', () => {
        const remove = vi.spyOn(window, 'removeEventListener');
        new AparteClient({ autoRegister: false }).stop();
        expect(remove).not.toHaveBeenCalled();
    });

    it('a started client still removes its listeners on stop', () => {
        const remove = vi.spyOn(window, 'removeEventListener');
        const client = new AparteClient({ autoRegister: false });
        client.start();
        client.stop();
        expect(remove.mock.calls.map(([type]) => type)).toContain('aparte-send');
        remove.mockClear();
        client.stop();
        expect(remove).not.toHaveBeenCalled();
    });
});
