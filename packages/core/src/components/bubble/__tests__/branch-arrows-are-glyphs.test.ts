// @vitest-environment jsdom
/**
 * The branch picker's arrows are glyphs from the icon provider (UI audit, visual half —
 * LOT 17).
 *
 * The bubble wrote `‹` and `›` as text: 4×5px of hairline ink beside 14×14 SVG icons
 * with a 2-unit stroke, in the same action row. Meanwhile `prevBranchIcon` and
 * `nextBranchIcon` existed in the glyph set and were registered as icon-provider keys —
 * so `setIconProvider({ prevBranch })` was a documented lever that did nothing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';

const MINE = '<svg data-mine="yes"></svg>';

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

function mount(): HTMLElement {
    const bubble = document.createElement('aparte-chat-bubble');
    bubble.setAttribute('data-role', 'assistant');
    bubble.setAttribute('message-id', 'a1');
    document.body.appendChild(bubble);
    return bubble;
}

describe('the branch arrows', () => {
    it('are drawn as glyphs, not characters', () => {
        const bubble = mount();
        expect(bubble.querySelector('.aparte-branch-prev svg')).toBeTruthy();
        expect(bubble.querySelector('.aparte-branch-next svg')).toBeTruthy();
        expect(bubble.querySelector('.aparte-branch-prev')?.textContent?.trim()).toBe('');
    });

    it('come from the icon provider, so setIconProvider({ prevBranch, nextBranch }) reaches them', () => {
        aparteGlobalConfig.setIconProvider({ prevBranch: () => MINE, nextBranch: () => MINE });
        const bubble = mount();
        expect(bubble.querySelector('.aparte-branch-prev')?.innerHTML).toContain('data-mine');
        expect(bubble.querySelector('.aparte-branch-next')?.innerHTML).toContain('data-mine');
    });
});
