/**
 * Installing the built-ins never replaces a renderer the app already registered —
 * on BOTH paths.
 *
 * There are two ways the built-ins arrive: `registerDefaultRenderers()`, which an
 * app calls (and which `new AparteClient()` calls for it), and the lazy
 * `installDefaultRenderersOnce()`, which the bubble calls the first time a segment
 * has no renderer. The lazy one documented itself as "strictly additive: a type
 * someone registered themselves is never replaced". The eager one overwrote.
 *
 * That divergence cost an hour of real debugging, and the shape of it is worth
 * recording because it is the shape this repo keeps finding. The vanilla example
 * registered a custom `thinking` renderer at startup and THEN built its
 * `AparteClient` — the order any reader would write, since the client is the last
 * thing you construct. `autoRegister` defaults on, so the client put the built-in
 * back. Everything then lied in the same direction: `getSegmentRenderer('thinking')`
 * returned the custom renderer when asked, the registry genuinely held it, and the
 * DOM showed the built-in's output — because the overwrite happened after the probe
 * and before the first render. Nothing in the API or the docs said order mattered.
 *
 * Two paths answering one question differently is the bug. This pins the answer.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    registerSegmentRenderer,
    registerDefaultRenderers,
    installDefaultRenderersOnce,
    getSegmentRenderer,
} from '../segment-renderers.js';
import { AparteConfig } from '../../config/aparte-config.js';
import type { AparteSegmentRenderer } from '../../types/index.js';

const mine: AparteSegmentRenderer = {
    type: 'thinking',
    render: () => '<div data-mine="1"></div>',
};

describe('installing the built-ins is additive', () => {
    it('registerDefaultRenderers keeps a renderer the app registered first', () => {
        // A fresh config per test: the registry is per-config, so this needs no
        // global reset and cannot leak into its neighbours.
        const config = new AparteConfig();
        registerSegmentRenderer(mine, config);

        registerDefaultRenderers(config);

        expect(getSegmentRenderer('thinking', config)).toBe(mine);
        // …and it still installed everything else.
        expect(getSegmentRenderer('text', config)).toBeDefined();
        expect(getSegmentRenderer('code', config)).toBeDefined();
    });

    it('installDefaultRenderersOnce does the same, as it always claimed', () => {
        const config = new AparteConfig();
        registerSegmentRenderer(mine, config);

        installDefaultRenderersOnce(config);

        expect(getSegmentRenderer('thinking', config)).toBe(mine);
        expect(getSegmentRenderer('text', config)).toBeDefined();
    });

    it('registering after the built-ins still wins, so neither order surprises', () => {
        const config = new AparteConfig();
        registerDefaultRenderers(config);

        registerSegmentRenderer(mine, config);

        expect(getSegmentRenderer('thinking', config)).toBe(mine);
    });

    it('a client-shaped sequence — register, then construct — survives', () => {
        // The exact sequence the vanilla example writes, reduced to its two calls.
        const config = new AparteConfig();
        registerSegmentRenderer(mine, config);
        registerDefaultRenderers(config); // what `new AparteClient()` does for you
        registerDefaultRenderers(config); // and again, in case something repeats it

        const resolved = getSegmentRenderer('thinking', config)!;
        // Asserted through the OUTPUT, not just by identity: identity was already
        // true in the browser while the DOM showed the built-in.
        expect(resolved.render({ id: 's', type: 'thinking' })).toContain('data-mine');
    });

    it('does not warn about anything on either path', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        const config = new AparteConfig();
        registerSegmentRenderer(mine, config);
        registerDefaultRenderers(config);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});
