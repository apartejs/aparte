// @vitest-environment jsdom
/**
 * The artifact card's tabs keep the promise the role makes.
 *
 * It announced `role="tablist"` with `role="tab"` buttons and shipped none of the
 * pattern's obligations: no `aria-controls`, no `role="tabpanel"`, no ids to point at,
 * and no arrow keys — two ordinary buttons wearing a role that tells a screen-reader user
 * to expect a relationship and a keyboard model that were not there. A role that lies is
 * worse than no role: the plain buttons at least behaved as announced.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { artifactRenderer } from '../../../segments/artifact/card.js';
import type { AparteArtifactSegment } from '../../../../types/segments.js';

const SEGMENT = {
    id: 'seg-1', type: 'artifact', artifactType: 'html', mimeType: 'text/html',
    title: 'demo', content: '<p>hi</p>',
} as AparteArtifactSegment;

let host: HTMLElement;

beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    host.innerHTML = artifactRenderer.render(SEGMENT);
    document.body.appendChild(host);
    artifactRenderer.setup?.(host, SEGMENT);
});

const tabs = (): HTMLButtonElement[] => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

describe('artifact card — the tablist pattern', () => {
    it('each tab points at a panel that exists and names it back', () => {
        for (const tab of tabs()) {
            const id = tab.getAttribute('aria-controls');
            expect(id, 'a tab must control something').toBeTruthy();
            const panel = document.getElementById(id!);
            expect(panel, `panel ${id}`).not.toBeNull();
            expect(panel!.getAttribute('role')).toBe('tabpanel');
            expect(panel!.getAttribute('aria-labelledby')).toBe(tab.id);
        }
    });

    it('the tablist is ONE tab stop, not one per tab', () => {
        const stops = tabs().filter((t) => t.tabIndex === 0);
        expect(stops, 'exactly one tab is in the tab order').toHaveLength(1);
        expect(stops[0]?.getAttribute('aria-selected')).toBe('true');
    });

    it('an arrow moves the selection, and the tab stop with it', () => {
        const [first, second] = tabs();
        expect(second, 'this artifact is previewable, so there are two tabs').toBeTruthy();

        first!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));

        expect(second!.getAttribute('aria-selected')).toBe('true');
        expect(second!.tabIndex).toBe(0);
        expect(first!.getAttribute('aria-selected')).toBe('false');
        expect(first!.tabIndex).toBe(-1);
    });

    it('ids are scoped to the segment, so two cards do not collide', () => {
        const other = document.createElement('div');
        other.innerHTML = artifactRenderer.render({ ...SEGMENT, id: 'seg-2' } as AparteArtifactSegment);
        document.body.appendChild(other);

        const a = host.querySelector('[role="tab"]')!.id;
        const b = other.querySelector('[role="tab"]')!.id;
        expect(a).not.toBe(b);
    });
});
