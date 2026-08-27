import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '../aparte-config';
import { APARTE_DEFAULT_ICON_FALLBACKS, type AparteIconName } from '../icon-provider';
import { APARTE_DEFAULT_SKELETON_FALLBACKS, type AparteSkeletonType } from '../skeleton-provider';

// These two default-fallback modules ship the zero-dependency icon/skeleton
// markup used when no provider is registered. They're pure data (no `if`
// branches), so the meaningful assertions are about the actual SHAPE of the
// markup each key produces — not just "is defined".

describe('APARTE_DEFAULT_ICON_FALLBACKS', () => {
    afterEach(() => aparteGlobalConfig.reset());

    const requiredIconNames: AparteIconName[] = [
        'copy', 'check', 'send', 'loading', 'error', 'expand', 'collapse',
        'terminal', 'paperclip', 'image', 'file', 'scrollDown', 'retry',
        'edit', 'thumbUp', 'thumbDown', 'prevBranch', 'nextBranch',
        'tool', 'close', 'stop',
    ];

    it('has an entry for every icon name and every entry is a non-empty SVG string', () => {
        for (const name of requiredIconNames) {
            const svg = APARTE_DEFAULT_ICON_FALLBACKS[name];
            expect(svg, `icon "${name}"`).toBeTruthy();
            expect(svg).toMatch(/^<svg /);
            expect(svg).toContain('</svg>');
        }
    });

    it('produces visually distinct markup per icon (no accidental aliasing)', () => {
        const values = requiredIconNames.map(name => APARTE_DEFAULT_ICON_FALLBACKS[name]);
        expect(new Set(values).size).toBe(values.length);
    });

    it('aparteGlobalConfig.getIcon() returns the exact default SVG when no provider is registered', () => {
        expect(aparteGlobalConfig.getIcon('copy')).toBe(APARTE_DEFAULT_ICON_FALLBACKS.copy);
        expect(aparteGlobalConfig.getIcon('send')).toBe(APARTE_DEFAULT_ICON_FALLBACKS.send);
        expect(aparteGlobalConfig.getIcon('stop')).toBe(APARTE_DEFAULT_ICON_FALLBACKS.stop);
    });

    it('the loading icon carries the spin class used for the CSS animation', () => {
        expect(APARTE_DEFAULT_ICON_FALLBACKS.loading).toContain('aparte-icon-spin');
    });

    it('the stop icon is a filled square glyph (not stroke-based like the others)', () => {
        expect(APARTE_DEFAULT_ICON_FALLBACKS.stop).toContain('fill="currentColor"');
        expect(APARTE_DEFAULT_ICON_FALLBACKS.stop).toContain('<rect');
    });

    it('getIcon() falls back per-key to the default when a partial provider is registered', () => {
        // Provider only implements the required (non-optional) icons.
        aparteGlobalConfig.setIconProvider({
            copy: () => '<i class="my-copy"/>',
            check: () => '<i class="my-check"/>',
            send: () => '<i class="my-send"/>',
            loading: () => '<i class="my-loading"/>',
            error: () => '<i class="my-error"/>',
            expand: () => '<i class="my-expand"/>',
            collapse: () => '<i class="my-collapse"/>',
            terminal: () => '<i class="my-terminal"/>',
            paperclip: () => '<i class="my-paperclip"/>',
            image: () => '<i class="my-image"/>',
            file: () => '<i class="my-file"/>',
            scrollDown: () => '<i class="my-scrolldown"/>',
            retry: () => '<i class="my-retry"/>',
            edit: () => '<i class="my-edit"/>',
            thumbUp: () => '<i class="my-thumbup"/>',
            thumbDown: () => '<i class="my-thumbdown"/>',
            prevBranch: () => '<i class="my-prev"/>',
            nextBranch: () => '<i class="my-next"/>',
            // tool / close / stop deliberately omitted (optional keys)
        });

        // Implemented keys use the custom provider...
        expect(aparteGlobalConfig.getIcon('copy')).toBe('<i class="my-copy"/>');
        // ...while the omitted optional keys still resolve to the built-in SVG.
        expect(aparteGlobalConfig.getIcon('tool')).toBe(APARTE_DEFAULT_ICON_FALLBACKS.tool);
        expect(aparteGlobalConfig.getIcon('close')).toBe(APARTE_DEFAULT_ICON_FALLBACKS.close);
        expect(aparteGlobalConfig.getIcon('stop')).toBe(APARTE_DEFAULT_ICON_FALLBACKS.stop);
    });
});

describe('APARTE_DEFAULT_SKELETON_FALLBACKS', () => {
    afterEach(() => aparteGlobalConfig.reset());

    const allTypes: AparteSkeletonType[] = ['message', 'code', 'thinking', 'input', 'list', 'text'];

    it('has an entry for every skeleton type and each wears the fallback class', () => {
        for (const type of allTypes) {
            const html = APARTE_DEFAULT_SKELETON_FALLBACKS[type];
            expect(html, `skeleton "${type}"`).toBeTruthy();
            expect(html).toContain('class="aparte-skeleton-fallback');
            expect(html, 'the look belongs in styles/, never in a style attribute').not.toContain('style=');
        }
    });

    /*
     * This used to assert `background:#1e293b` — the literal Tailwind-slate hex, in a
     * test. So the defect had a guard of its own: the fallback carried its look in a
     * `style=""` attribute, which no consumer stylesheet can override and which
     * `check:derived-vars` cannot see, because it reads only `styles/`. What the test
     * MEANT is that a code skeleton is distinguishable from a plain one; it says that
     * now, and `styles/display/skeleton.css` decides what the difference looks like.
     */
    it('the code skeleton is distinguishable from the plain ones', () => {
        expect(APARTE_DEFAULT_SKELETON_FALLBACKS.code).toContain('aparte-skeleton-fallback--code');
        expect(APARTE_DEFAULT_SKELETON_FALLBACKS.message).not.toContain('--code');
    });

    it('each type has distinct copy (message/code/thinking/list are not interchangeable)', () => {
        expect(APARTE_DEFAULT_SKELETON_FALLBACKS.message).toContain('Loading...');
        expect(APARTE_DEFAULT_SKELETON_FALLBACKS.thinking).toContain('Thinking...');
        expect(APARTE_DEFAULT_SKELETON_FALLBACKS.list).toContain('Loading items...');
        expect(APARTE_DEFAULT_SKELETON_FALLBACKS.code).toContain('Loading code...');
    });

    it('aparteGlobalConfig.getSkeleton() returns the exported default, not a copy of it', () => {
        /*
         * This used to say: "AparteConfig keeps its own private `_defaultSkeletonRenderer`
         * fallback table (same content, separate copy) — assert the *content*, not object
         * identity." The two had already drifted: `message` read "Loading message..." in
         * the private table and "Loading..." in the exported one, and `text` the reverse.
         * A duplicate that disagrees with its original is worse than either, because
         * whichever you read you cannot tell which one ships. There is one table now, so
         * this asserts identity — the check the old note explained why it could not make.
         */
        for (const type of allTypes) {
            expect(aparteGlobalConfig.getSkeleton(type)).toBe(APARTE_DEFAULT_SKELETON_FALLBACKS[type]);
        }
    });

    it('getSkeleton() defers entirely to a registered provider, bypassing the default', () => {
        aparteGlobalConfig.setSkeletonProvider({ getSkeleton: (type) => `<custom-skeleton data-type="${type}"/>` });
        expect(aparteGlobalConfig.getSkeleton('code')).toBe('<custom-skeleton data-type="code"/>');
        expect(aparteGlobalConfig.getSkeleton('list')).toBe('<custom-skeleton data-type="list"/>');
    });
});
