// @vitest-environment jsdom
/**
 * Where a panel mounts.
 *
 * "Right after the first input" is a position, not a choice: a layout with the input
 * in a row and the panel meant for a block of its own had no way to say so. A
 * descendant marked `data-aparte-panel-host` is that way; without one, nothing changes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';
import type { AparteComposer } from '../aparte-composer.js';

afterEach(() => { document.body.innerHTML = ''; });

const mount = (html: string): AparteComposer => {
    document.body.innerHTML = html;
    return document.querySelector('aparte-composer') as AparteComposer;
};

describe('panel host', () => {
    it('mounts the panel inside the marked host when there is one', () => {
        const composer = mount(`<aparte-composer>
            <div class="row"><aparte-composer-input></aparte-composer-input></div>
            <div class="block" data-aparte-panel-host></div>
        </aparte-composer>`);
        const panel = document.createElement('div');
        composer.showPanel(panel);
        expect(panel.parentElement?.className).toBe('block');
        expect(panel.dataset['apartePanel']).toBe('true');
    });

    it('falls back to right after the first input without a host', () => {
        const composer = mount(`<aparte-composer>
            <div class="row"><aparte-composer-input></aparte-composer-input><span class="after"></span></div>
        </aparte-composer>`);
        const panel = document.createElement('div');
        composer.showPanel(panel);
        expect(panel.previousElementSibling?.tagName.toLowerCase()).toBe('aparte-composer-input');
        expect(panel.nextElementSibling?.className).toBe('after');
    });
});
