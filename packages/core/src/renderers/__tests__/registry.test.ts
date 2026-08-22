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
import { AparteConfig } from '../../config/aparte-config.js';

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
