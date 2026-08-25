// @vitest-environment jsdom
/**
 * The composer has ONE panel slot, and it has an owner.
 *
 * Nothing used to say whose it was. `showPanel` empties the slot unconditionally,
 * `hidePanel` closed whatever was there, and three paths closed a panel whose owner
 * was still awaiting an answer without telling it: a second `showPanel`, the owner's
 * own late `hidePanel`, and `_handleMessageDone` — which fires on EVERY turn end.
 *
 * That last one was a live defect, not a hypothetical: a question still open when a
 * turn finished lost its panel while the presenter kept its pending state, so the
 * request never settled and every later request was short-circuited for the life of
 * the page. One finished turn and the chat could never ask anything again.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-composer.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteComposer } from '../aparte-composer.js';

function mount(): AparteComposer {
    const composer = document.createElement('aparte-composer') as AparteComposer;
    document.body.appendChild(composer);
    return composer;
}

const panel = (name: string): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'aparte-elic-panel';
    el.dataset['probe'] = name;
    return el;
};

const openProbe = (): string | undefined =>
    document.querySelector<HTMLElement>('[data-aparte-panel]')?.dataset['probe'];

describe('the composer panel slot has an owner', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    it('tells an owner when something else takes the slot', () => {
        const composer = mount();
        const evicted = vi.fn();

        composer.showPanel(panel('first'), { onEvict: evicted });
        composer.showPanel(panel('second'));

        expect(evicted, 'the owner is the only thing that can settle its own promise').toHaveBeenCalledOnce();
        expect(openProbe()).toBe('second');
    });

    it('tells an owner when a turn ending closes the slot', () => {
        const composer = mount();
        const evicted = vi.fn();

        composer.showPanel(panel('open'), { onEvict: evicted });
        // The composer hides its panel on any turn-ending lifecycle event. Before this,
        // the panel simply vanished and the owner was never told.
        window.dispatchEvent(new CustomEvent('aparte-message-done'));

        expect(evicted).toHaveBeenCalledOnce();
        expect(composer.panelActive).toBe(false);
    });

    it('does not let a stale owner close the panel that replaced it', () => {
        const composer = mount();

        const first = composer.showPanel(panel('first'));
        const second = composer.showPanel(panel('second'));

        // The first owner settling late. Without a token this closed the SECOND
        // request's panel — the owner of record had changed, and `hidePanel` closed
        // whatever it found.
        composer.hidePanel(first);

        expect(composer.panelActive, "the second request's panel must survive").toBe(true);
        expect(openProbe()).toBe('second');

        // And the real owner still closes its own.
        composer.hidePanel(second);
        expect(composer.panelActive).toBe(false);
    });

    it('still closes whatever is open when called with no token', () => {
        // A consumer driving the composer directly, and `reset()`, both mean "close it".
        const composer = mount();
        composer.showPanel(panel('only'));
        composer.hidePanel();
        expect(composer.panelActive).toBe(false);
    });
});
