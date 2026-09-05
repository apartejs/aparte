/**
 * A failed load must not disable auto-titling for the life of the page.
 *
 * The model is resolved once and cached — but the cache used to keep a REJECTED
 * promise, so one transient failure (the fetch of the 132 KB model, a CSP hiccup
 * on the dynamic import) meant every conversation from then on kept its default
 * title, silently. `@aparte/plugin-shiki` clears its cached promise on failure for
 * exactly this reason.
 */
import { describe, it, expect, vi } from 'vitest';
import { createTitleProvider } from './index.js';

const msg = (content: string) => ({ id: 'm', role: 'user' as const, content, timestamp: 1 });

describe('createTitleProvider — a loader that fails', () => {
    it('retries on the next title instead of caching the rejection', async () => {
        const titler = { title: () => 'a title' };
        const load = vi.fn()
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValue(titler);
        const provider = createTitleProvider({ titler: load });

        await expect(provider('first message', msg('first message'))).rejects.toThrow('network');
        await expect(provider('second message', msg('second message'))).resolves.toBe('a title');
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('still loads once when the load succeeds', async () => {
        const load = vi.fn(async () => ({ title: () => 'a title' }));
        const provider = createTitleProvider({ titler: load });

        await Promise.all([provider('one', msg('one')), provider('two', msg('two'))]);
        await provider('three', msg('three'));

        expect(load).toHaveBeenCalledTimes(1);
    });
});
