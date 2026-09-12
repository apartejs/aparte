// @vitest-environment jsdom
/**
 * A select that has been moved still opens on one click.
 *
 * `_render()` returns early when the dropdown already exists, so the trigger element
 * SURVIVES a disconnect/reconnect — while `_setupEventListeners()` runs from every
 * `connectedCallback` and attached inline arrows to that same surviving element. They
 * can never be removed, so each move added one more: after an even number of moves a
 * single click ran `_toggle()` twice and the control looked dead; after an odd number it
 * fired `aparte-select-open` twice for one click. A portal, a Vue teleport, an Angular
 * structural directive or a React key change are ordinary ways to move a node, and
 * `@aparte/plugin-model-selector` is built on this element.
 *
 * Its neighbour leaked the same way: `_setupMutationObserver()` assigned a new observer
 * over the old one without disconnecting it, from `_render()` AND from
 * `connectedCallback` — two live observers on the very first mount, one more per
 * reconnect, and `_updateDropdownContent` can only silence the newest before its own
 * writes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-select.js';
import '../aparte-option.js';

type SelectEl = HTMLElement & { open: boolean; value: string };

async function mount(): Promise<{ sel: SelectEl; a: HTMLElement; b: HTMLElement }> {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const sel = document.createElement('aparte-select') as SelectEl;
    sel.innerHTML = '<aparte-option value="one">One</aparte-option><aparte-option value="two">Two</aparte-option>';
    a.appendChild(sel);
    await vi.waitFor(() => expect(sel.querySelector('.aparte-select-trigger')).not.toBeNull());
    return { sel, a, b };
}

const trigger = (sel: SelectEl): HTMLElement => sel.querySelector<HTMLElement>('.aparte-select-trigger')!;

describe('an <aparte-select> that a framework has moved', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('opens on the first click after one re-parent', async () => {
        const { sel, b } = await mount();
        b.appendChild(sel);
        trigger(sel).click();
        expect(sel.open, 'one click, one toggle').toBe(true);
    });

    it('announces one open per click after two', async () => {
        const { sel, a, b } = await mount();
        b.appendChild(sel);
        a.appendChild(sel);
        const opened: unknown[] = [];
        sel.addEventListener('aparte-select-open', (e) => opened.push(e));
        trigger(sel).click();
        expect(opened).toHaveLength(1);
    });

    it('keeps exactly one mutation observer alive, from the first mount on', async () => {
        const live: Array<{ disconnected: boolean }> = [];
        const Real = globalThis.MutationObserver;
        class Counted extends Real {
            private readonly _entry = { disconnected: false };
            constructor(cb: MutationCallback) { super(cb); live.push(this._entry); }
            override disconnect(): void { this._entry.disconnected = true; super.disconnect(); }
            override observe(target: Node, init?: MutationObserverInit): void {
                this._entry.disconnected = false;
                super.observe(target, init);
            }
        }
        globalThis.MutationObserver = Counted as unknown as typeof MutationObserver;
        try {
            const { sel, b } = await mount();
            b.appendChild(sel);
            await vi.waitFor(() => expect(sel.querySelector('.aparte-select-trigger')).not.toBeNull());
            expect(live.filter((o) => !o.disconnected), 'one observer, not one per connect').toHaveLength(1);
        } finally {
            globalThis.MutationObserver = Real;
        }
    });
});
