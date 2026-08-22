/**
 * The registry itself: which renderer draws which segment type, per config,
 * and the styles they contribute.
 *
 * One of the eleven files the old 844-line `segment-renderers.test.ts` became.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    registerSegmentRenderer,
    unregisterSegmentRenderer,
    getSegmentRenderer,
    collectRendererStyles,
    registerDefaultRenderers,
    declineDefaultRenderers,
    installDefaultRenderersOnce
} from '../segment-renderers.js';
import { AparteConfig, aparteGlobalConfig } from '../../config/aparte-config.js';

// Register the default renderers once, so the built-in under test is resolvable.
registerDefaultRenderers();

// ─── registry CRUD ────────────────────────────────────────────────────

describe('registerSegmentRenderer / getSegmentRenderer', () => {
    afterEach(() => {
        unregisterSegmentRenderer('test_type');
    });

    it('registers a renderer and retrieves it by type', () => {
        const renderer = { type: 'test_type', render: () => '<div/>' };
        registerSegmentRenderer(renderer);
        expect(getSegmentRenderer('test_type')).toBe(renderer);
    });

    it('returns undefined for an unregistered type', () => {
        expect(getSegmentRenderer('__unknown__')).toBeUndefined();
    });

    it('overwrites an existing renderer when re-registered', () => {
        const r1 = { type: 'test_type', render: () => 'R1' };
        const r2 = { type: 'test_type', render: () => 'R2' };
        registerSegmentRenderer(r1);
        registerSegmentRenderer(r2);
        expect(getSegmentRenderer('test_type')).toBe(r2);
    });
});

describe('unregisterSegmentRenderer', () => {
    it('removes a registered renderer', () => {
        registerSegmentRenderer({ type: 'test_type', render: () => '' });
        unregisterSegmentRenderer('test_type');
        expect(getSegmentRenderer('test_type')).toBeUndefined();
    });

    it('is a no-op for an unregistered type', () => {
        expect(() => unregisterSegmentRenderer('never_registered')).not.toThrow();
    });
});

// ─── collectRendererStyles ────────────────────────────────────────────

describe('collectRendererStyles()', () => {
    beforeEach(() => {
        registerSegmentRenderer({
            type: 'styled_test',
            render: () => '',
            getStyles: () => '.styled-test { color: hotpink; }'
        });
    });
    afterEach(() => {
        unregisterSegmentRenderer('styled_test');
    });

    it('includes styles from renderers that implement getStyles()', () => {
        const styles = collectRendererStyles();
        expect(styles).toContain('.styled-test { color: hotpink; }');
    });
});

describe('the segment registry is per CONFIG, not per module', () => {
// The wrappers all advertise a `config` prop for "several independently
// configured chats on one page". Until 0.8.0 that was only half true: what a
// plugin registered on the config was scoped, but segment renderers lived in a
// module-level Map, so two chats shared them whatever config they were given.
it('two configs can render the same segment type differently', () => {
    const a = new AparteConfig();
    const b = new AparteConfig();

    registerSegmentRenderer({ type: 'text', render: () => '<p>FROM A</p>' }, a);
    registerSegmentRenderer({ type: 'text', render: () => '<p>FROM B</p>' }, b);

    expect(getSegmentRenderer('text', a)!.render({ id: 's', type: 'text' } as never))
        .toContain('FROM A');
    expect(getSegmentRenderer('text', b)!.render({ id: 's', type: 'text' } as never))
        .toContain('FROM B');
});

it('registering on one config leaves the other untouched', () => {
    const a = new AparteConfig();
    const b = new AparteConfig();
    registerSegmentRenderer({ type: 'zz-custom', render: () => 'x' }, a);
    expect(getSegmentRenderer('zz-custom', a)).toBeTruthy();
    expect(getSegmentRenderer('zz-custom', b)).toBeUndefined();
});

it('declining the built-ins on one config does not mute the other', () => {
    const declined = new AparteConfig();
    const normal = new AparteConfig();

    declineDefaultRenderers(declined);
    installDefaultRenderersOnce(declined);
    installDefaultRenderersOnce(normal);

    expect(getSegmentRenderer('text', declined), 'declined config must stay empty').toBeUndefined();
    expect(getSegmentRenderer('text', normal), 'the other config must get the built-ins').toBeTruthy();
});
});

/**
 * A renderer registered the way the guide shows it must reach a chat that was
 * given its own config.
 *
 * The documented call is `registerSegmentRenderer(myRenderer)` — no second
 * argument, because at app startup there is no element and no active render, so
 * `contextConfig()` is the global singleton. A chat with a `config` prop then
 * resolved ITS registry, found nothing, and drew
 * `[Unknown segment type: my-chart]`. The renderer was invisible to precisely the
 * feature the `config` prop exists for.
 */
describe('an instance config inherits what was registered globally', () => {
    afterEach(() => {
        unregisterSegmentRenderer('zz-inherited');
        unregisterSegmentRenderer('zz-inherited', aparteGlobalConfig);
    });

    it('sees a renderer registered the documented way, with no config argument', () => {
        registerSegmentRenderer({ type: 'zz-inherited', render: () => '<p>MINE</p>' });

        const chat = new AparteConfig();
        expect(getSegmentRenderer('zz-inherited', chat), 'the chat must see it').toBeTruthy();
        expect(getSegmentRenderer('zz-inherited', chat)!.render({ id: 's', type: 'zz-inherited' } as never))
            .toContain('MINE');
    });

    it('lets the instance override an inherited type without touching the global', () => {
        registerSegmentRenderer({ type: 'zz-inherited', render: () => '<p>GLOBAL</p>' });
        const chat = new AparteConfig();
        registerSegmentRenderer({ type: 'zz-inherited', render: () => '<p>SCOPED</p>' }, chat);

        expect(getSegmentRenderer('zz-inherited', chat)!.render({ id: 's', type: 'zz-inherited' } as never))
            .toContain('SCOPED');
        expect(getSegmentRenderer('zz-inherited', aparteGlobalConfig)!.render({ id: 's', type: 'zz-inherited' } as never))
            .toContain('GLOBAL');
    });

    it('inherits nothing into a config that declined the built-ins', () => {
        registerSegmentRenderer({ type: 'zz-inherited', render: () => '<p>MINE</p>' });
        const byo = new AparteConfig();
        declineDefaultRenderers(byo);

        // `autoRegister: false` means "I bring my own everything". Quietly handing
        // it the global's renderers would turn that option back into a no-op.
        expect(getSegmentRenderer('zz-inherited', byo)).toBeUndefined();
    });
});
