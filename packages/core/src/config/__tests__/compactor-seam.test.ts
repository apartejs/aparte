// @vitest-environment jsdom
/**
 * The compactor seam: what makes the context smaller is registered on a config, not
 * imported. The gauge's Compact now, a separator's Retry and (later) the client's pre-flight
 * all ask the config for it, so a page without the compaction plugin has none and nothing
 * pretends otherwise.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AparteConfig, aparteGlobalConfig } from '../index.js';
import type { AparteCompactor } from '../../types/index.js';

const compactor = (): AparteCompactor => ({
    compact: vi.fn().mockResolvedValue({ ok: true, skipped: true, reason: 'empty' }),
    settled: vi.fn().mockResolvedValue(undefined),
});

afterEach(() => aparteGlobalConfig.reset());

describe('AparteConfig.setCompactor / getCompactor', () => {
    it('has none until one is registered, and gives back the one it was given', () => {
        const config = new AparteConfig();
        expect(config.getCompactor()).toBeNull();
        const c = compactor();
        config.setCompactor(c);
        expect(config.getCompactor()).toBe(c);
    });

    it('null removes it', () => {
        const config = new AparteConfig();
        config.setCompactor(compactor());
        config.setCompactor(null);
        expect(config.getCompactor()).toBeNull();
    });

    it('tells subscribers and the window, so a mounted gauge hears that Compact now became possible', () => {
        const config = new AparteConfig();
        const subscriber = vi.fn();
        config.subscribe(subscriber);
        const onChange = vi.fn();
        window.addEventListener('aparte-config-change', onChange);

        config.setCompactor(compactor());
        config.setCompactor(null);

        expect(subscriber).toHaveBeenCalledTimes(2);
        expect(onChange).toHaveBeenCalledTimes(2);
        window.removeEventListener('aparte-config-change', onChange);
    });

    it('belongs to its config: an instance has its own, the global one is untouched', () => {
        const own = new AparteConfig();
        own.setCompactor(compactor());
        expect(aparteGlobalConfig.getCompactor()).toBeNull();
    });

    it('is forgotten by reset(), like every other registration', () => {
        const config = new AparteConfig();
        config.setCompactor(compactor());
        config.reset();
        expect(config.getCompactor()).toBeNull();
    });
});
