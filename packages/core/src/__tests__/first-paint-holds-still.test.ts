/**
 * The first paint has the final shape (Lighthouse on the chat site, 2026-09-05).
 *
 * A page that ships the chat as static HTML paints before the custom elements are
 * defined, and every element that gives itself a size at upgrade moved the page: the
 * composer laid at the bottom then centred (360px on a phone), the editor grew from 16
 * to 52px, the chips appeared, the empty toolbar band vanished — a 0.226 layout shift,
 * 0.011 once these rules reserved the room before definition. Each is keyed on
 * `:not(:defined)`, so a defined element is governed by its own rules alone.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet';

const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, ' ');

function declarationsOf(selector: string): string {
    const out: string[] = [];
    for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
        const selectors = m[1]!.split(',').map((s) => s.trim().replace(/\s+/g, ' '));
        if (selectors.includes(selector)) out.push(m[2]!);
    }
    return out.join('\n');
}

describe('before an element is defined, the page already has its shape', () => {
    it('read the corpus', () => {
        expect(css.length).toBeGreaterThan(100_000);
    });

    it('an empty center-empty chat centres its composer from the first frame, and its viewport releases its height', () => {
        const chat = 'aparte-chat[center-empty]:not(:defined):not(:has(aparte-chat-bubble))';
        expect(declarationsOf(chat)).toMatch(/justify-content\s*:\s*center/);
        const viewport = declarationsOf(`${chat} > aparte-chat-viewport`);
        expect(viewport).toMatch(/flex-grow\s*:\s*0/);
        // The same release the defined [data-empty] rule makes: the standalone
        // height: 100% ignores flex-grow: 0.
        expect(viewport).toMatch(/height\s*:\s*auto/);
    });

    it('the composer input reserves the editor\'s height', () => {
        const input = declarationsOf('aparte-composer-input:not(:defined)');
        expect(input).toMatch(/display\s*:\s*block/);
        expect(input).toMatch(/min-height\s*:\s*var\(--aparte-composer-control-size\)/);
    });

    it('the suggestions reserve one row while the chat is empty', () => {
        const strip = declarationsOf('aparte-chat:not(:has(aparte-chat-bubble)) aparte-suggestions[empty-only]:not(:defined)');
        expect(strip).toMatch(/min-height\s*:\s*var\(--aparte-btn-size-sm\)/);
    });

    it('a toolbar holding only whitespace draws nothing before it can say so itself', () => {
        expect(declarationsOf('aparte-composer-toolbar:not(:defined):not(:has(*))')).toMatch(/display\s*:\s*none/);
    });
});
