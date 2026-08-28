import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '../aparte-config';
import { APARTE_DEFAULT_ICON_FALLBACKS, type AparteIconName } from '../icon-provider';

// The default-fallback module ships the zero-dependency icon markup used when no
// provider is registered. It is pure data (no `if` branches), so the meaningful
// assertions are about the actual SHAPE of the markup each key produces — not
// just "is defined".

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
