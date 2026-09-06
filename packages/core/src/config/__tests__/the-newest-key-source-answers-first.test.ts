/**
 * Which key source answers, when a config holds more than one.
 *
 * `registerKeyProvider` is how a client puts the credentials it was handed where
 * everything that needs them can see them — the model list included. A page that
 * mounts a chat twice, or remounts one to swap options, therefore leaves more than
 * one source on the same config, and the order decides what a request is signed
 * with. The insertion order answered, so the FIRST resolver a page ever registered
 * kept answering for every later one: a remount could not change the key. The most
 * recent registration is the one that reflects the page's current intent.
 */
import { describe, it, expect } from 'vitest';
import { AparteConfig } from '../aparte-config.js';

describe('a config with several key sources', () => {
    it('lets the most recent registration answer', async () => {
        const cfg = new AparteConfig();
        cfg.registerKeyProvider(() => 'first');
        cfg.registerKeyProvider(() => 'second');

        expect(await cfg.getKey('vendor')).toBe('second');
    });

    it('falls through to an older source for a provider the newest has nothing for', async () => {
        const cfg = new AparteConfig();
        cfg.registerKeyProvider((id) => (id === 'vendor' ? 'from-the-older-source' : undefined));
        cfg.registerKeyProvider((id) => (id === 'other' ? 'from-the-newer-source' : undefined));

        expect(await cfg.getKey('vendor')).toBe('from-the-older-source');
        expect(await cfg.getKey('other')).toBe('from-the-newer-source');
    });

    it('falls back to setKeyProvider once a source has been torn down', async () => {
        const cfg = new AparteConfig();
        cfg.setKeyProvider(() => 'from-set-key-provider');
        const release = cfg.registerKeyProvider(() => 'from-the-registered-source');

        expect(await cfg.getKey('vendor')).toBe('from-the-registered-source');

        release();

        expect(await cfg.getKey('vendor')).toBe('from-set-key-provider');
    });

    it('counts one function registered twice as two sources, each with its own teardown', async () => {
        const cfg = new AparteConfig();
        const shared = () => 'sk-shared';
        const releaseFirst = cfg.registerKeyProvider(shared);
        cfg.registerKeyProvider(shared);

        releaseFirst();

        expect(await cfg.getKey('vendor')).toBe('sk-shared');
    });
});
