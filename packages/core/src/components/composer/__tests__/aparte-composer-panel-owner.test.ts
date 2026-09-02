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
import '../aparte-composer-input.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteComposer } from '../aparte-composer.js';

function mount(): AparteComposer {
    const composer = document.createElement('aparte-composer') as AparteComposer;
    composer.appendChild(document.createElement('aparte-composer-input'));
    document.body.appendChild(composer);
    return composer;
}

/** The contenteditable `focus()` forwards to — what "the composer has the focus" means. */
const editorOf = (composer: AparteComposer): HTMLElement =>
    composer.querySelector('[contenteditable]') as HTMLElement;

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
        // A consumer driving the composer directly means "close it".
        const composer = mount();
        composer.showPanel(panel('only'));
        composer.hidePanel();
        expect(composer.panelActive).toBe(false);
    });

    /*
     * The half this suite used to miss, and it cost a wedged chat.
     *
     * Closing the panel was asserted; TELLING ITS OWNER was not. `hidePanel()` with no
     * token called the silent teardown, which nulls `onEvict` without calling it — so a
     * consumer's `composer.hidePanel()` left the presenter's request pending forever, and
     * because `AparteConfig.requestUserInput` chains each request on the previous one, no
     * further question or approval on that config was ever presented again.
     */
    it('TELLS the owner when a no-token call closes their panel', () => {
        const composer = mount();
        let evicted = 0;
        composer.showPanel(panel('only'), { onEvict: () => { evicted += 1; } });

        composer.hidePanel();

        expect(composer.panelActive).toBe(false);
        expect(evicted, 'the owner must be told, or its request orphans').toBe(1);
    });

    /*
     * Closing the panel is not a reason to take the focus.
     *
     * The teardown ended on an unconditional `this.focus()`, so ANY close — the owner's
     * own, a consumer's `hidePanel()`, a turn ending — pulled the caret into the
     * composer's editor from wherever the reader had put it. It reads as a fix for the
     * keyboard user and is the opposite: the panel is allowed to hand back what it took,
     * never to take what it never had.
     */
    describe('the focus, on close', () => {
        it('stays where the reader put it when the composer never had it', () => {
            const composer = mount();
            composer.showPanel(panel('only'));

            const elsewhere = document.createElement('input');
            document.body.appendChild(elsewhere);
            elsewhere.focus();

            composer.hidePanel();

            expect(document.activeElement, 'the caret belongs to the reader').toBe(elsewhere);
        });

        it('comes back to the editor when it was inside the panel', () => {
            const composer = mount();
            const p = panel('only');
            p.tabIndex = -1;
            composer.showPanel(p);
            p.focus();
            expect(document.activeElement, 'precondition: the focus is in the panel').toBe(p);

            composer.hidePanel();

            expect(document.activeElement, 'or the reader is dropped on <body>').toBe(editorOf(composer));
        });
    });

    it('does NOT tell the owner when they close their own panel', () => {
        // The other half of the same rule. `<aparte-elicitation>` calls
        // `hidePanel(itsOwnToken)` immediately after it resolves; firing `onEvict` there
        // would report an eviction for a request that just settled normally.
        const composer = mount();
        let evicted = 0;
        const token = composer.showPanel(panel('only'), { onEvict: () => { evicted += 1; } });

        composer.hidePanel(token);

        expect(composer.panelActive).toBe(false);
        expect(evicted, 'the owner already knows — it closed it').toBe(0);
    });
});
