// @vitest-environment jsdom
/**
 * `<aparte-split>` in jsdom, which has no layout, no `PointerEvent` and no pointer
 * capture. So three things are faked and nothing else: a `matchMedia` stub for the
 * breakpoint (the sidebar's), `getBoundingClientRect` on the host and the primary pane
 * — the pane's box READS the live custom property, which is what a browser would do —
 * and `setPointerCapture` as a spy, because asserting that it is deferred to the first
 * move is the whole point of deferring it.
 *
 * Every assertion below is on an attribute, the inline custom property, the focus, the
 * scrim node or the event array. Never on a pixel: the pixels are `pnpm e2e`'s.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-split.js';
import type { AparteSplit, AparteSplitResizeDetail } from '../aparte-split.js';
import { aparteGlobalConfig, APARTE_DEFAULT_LOCALE } from '../../../config/index.js';

type MediaListener = (e: { matches: boolean }) => void;
let mediaMatches = false;
let mediaListeners: MediaListener[] = [];
let mediaCalls = 0;

beforeEach(() => {
    mediaMatches = false;
    mediaListeners = [];
    mediaCalls = 0;
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => {
        mediaCalls += 1;
        return {
            get matches() { return mediaMatches; },
            addEventListener: (_: string, cb: MediaListener) => { mediaListeners.push(cb); },
            removeEventListener: (_: string, cb: MediaListener) => { mediaListeners = mediaListeners.filter((l) => l !== cb); },
        };
    };
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

const narrow = (matches: boolean): void => {
    mediaMatches = matches;
    for (const cb of mediaListeners) cb({ matches });
};

const PANES = '<div class="one">chat</div><div class="two">pane</div>';

function mount(attrs: Record<string, string> = {}, html = PANES): AparteSplit {
    const el = document.createElement('aparte-split') as AparteSplit;
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
}

const handleOf = (el: AparteSplit): HTMLElement => el.querySelector<HTMLElement>('.aparte-split__handle')!;

const events = (el: HTMLElement): AparteSplitResizeDetail[] => {
    const seen: AparteSplitResizeDetail[] = [];
    el.addEventListener('aparte-split-resize', (e) => seen.push((e as CustomEvent<AparteSplitResizeDetail>).detail));
    return seen;
};

/** A rect that only has the two measures the element reads. */
const rect = (size: number): DOMRect =>
    ({ width: size, height: size, top: 0, left: 0, right: size, bottom: size, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

/**
 * Be the browser: the host is `containerPx` wide, and the primary pane is whatever
 * fraction the live `--aparte-split-position` asks for. That is what makes
 * `_achievedPercent()` — which reads the pane against the host — answer something real.
 */
function fakeLayout(el: AparteSplit, containerPx = 1000, paneIndex = 0): void {
    Object.defineProperty(el, 'getBoundingClientRect', { configurable: true, value: () => rect(containerPx) });
    const pane = el.children[paneIndex] as HTMLElement;
    Object.defineProperty(pane, 'getBoundingClientRect', {
        configurable: true,
        value: () => {
            const declared = Number.parseFloat(el.style.getPropertyValue('--aparte-split-position'));
            const percent = Number.isFinite(declared) ? declared : 38;
            return rect((percent / 100) * containerPx);
        },
    });
}

/** jsdom has no `PointerEvent`; a MouseEvent carries everything the element reads. */
function pointer(type: string, init: { clientX?: number; clientY?: number; buttons?: number } = {}): MouseEvent {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: init.buttons ?? 1,
        clientX: init.clientX ?? 0,
        clientY: init.clientY ?? 0,
    });
    Object.defineProperty(event, 'pointerId', { value: 7, configurable: true });
    return event;
}

/** The two capture methods jsdom does not implement, as spies. */
function spyCapture(handle: HTMLElement): ReturnType<typeof vi.fn> {
    const capture = vi.fn();
    (handle as unknown as { setPointerCapture: unknown }).setPointerCapture = capture;
    (handle as unknown as { releasePointerCapture: unknown }).releasePointerCapture = vi.fn();
    return capture;
}

const key = (type: string, k: string, shift = false): KeyboardEvent =>
    new KeyboardEvent(type, { key: k, shiftKey: shift, bubbles: true, cancelable: true });

describe('aparte-split', () => {
    describe('structure', () => {
        it('wears the recipe and inserts one handle between the panes', () => {
            const el = mount();
            expect(el.classList.contains('aparte-split')).toBe(true);
            expect(el.querySelectorAll('.aparte-split__handle')).toHaveLength(1);
            expect(el.children[1]).toBe(handleOf(el));
            expect(el.children).toHaveLength(3);
        });

        it('an author-written handle is adopted, not doubled', () => {
            const el = mount({}, '<div class="one">chat</div><div class="aparte-split__handle" id="mine"></div><div class="two">pane</div>');
            expect(el.querySelectorAll('.aparte-split__handle')).toHaveLength(1);
            expect(handleOf(el).id).toBe('mine');
            expect(handleOf(el).getAttribute('role')).toBe('separator');
        });

        it('an adopted handle is moved between the panes', () => {
            // The sheet addresses the panes positionally — three tracks with the seam in
            // the middle, and the stacked rules hide `:nth-child(1)` / `:nth-child(3)` —
            // so a handle written first would take the primary pane's track.
            const el = mount({}, '<div class="aparte-split__handle" id="mine"></div><div class="one">chat</div><div class="two">pane</div>');
            expect(el.querySelectorAll('.aparte-split__handle')).toHaveLength(1);
            expect(el.children[1]!.id).toBe('mine');
            expect((el.children[0] as HTMLElement).className).toBe('one');
            expect((el.children[2] as HTMLElement).className).toBe('two');
        });

        it('reconnecting does not duplicate the handle', () => {
            const el = mount();
            el.remove();
            document.body.appendChild(el);
            expect(el.querySelectorAll('.aparte-split__handle')).toHaveLength(1);
            expect(el.children).toHaveLength(3);
        });

        it('the handle is an APG separator', () => {
            const el = mount({ position: '38' });
            const handle = handleOf(el);
            expect(handle.getAttribute('role')).toBe('separator');
            expect(handle.getAttribute('tabindex')).toBe('0');
            // The attribute names the SEPARATOR's axis, which is the inverse of the container's.
            expect(handle.getAttribute('aria-orientation')).toBe('vertical');
            el.setAttribute('orientation', 'vertical');
            expect(handle.getAttribute('aria-orientation')).toBe('horizontal');
            expect(handle.getAttribute('aria-valuemin')).toBe('0');
            expect(handle.getAttribute('aria-valuemax')).toBe('100');
            expect(handle.getAttribute('aria-valuenow')).toBe('38');
            const pane = el.children[0] as HTMLElement;
            expect(pane.id).not.toBe('');
            expect(handle.getAttribute('aria-controls')).toBe(pane.id);
        });

        it('the announced value is inside the announced range at connect', () => {
            // A separator whose valuenow sits below its own valuemin is invalid ARIA, and
            // it is the ordinary case: `--aparte-split-min: 20rem` clamps a small
            // percentage on any narrow container. So the probe reconciles the three.
            const el = document.createElement('aparte-split') as AparteSplit;
            el.setAttribute('position', '10');
            el.innerHTML = PANES;
            Object.defineProperty(el, 'getBoundingClientRect', { configurable: true, value: () => rect(1000) });
            const pane = el.children[0] as HTMLElement;
            Object.defineProperty(pane, 'getBoundingClientRect', {
                configurable: true,
                value: () => {
                    const declared = Number.parseFloat(el.style.getPropertyValue('--aparte-split-position'));
                    const percent = Number.isFinite(declared) ? declared : 38;
                    // Be the CSS clamp: this pane cannot go below 30% or above 60%.
                    return rect((Math.min(60, Math.max(30, percent)) / 100) * 1000);
                },
            });
            document.body.appendChild(el);

            const handle = handleOf(el);
            expect(handle.getAttribute('aria-valuemin')).toBe('30');
            expect(handle.getAttribute('aria-valuemax')).toBe('60');
            expect(handle.getAttribute('aria-valuenow'), 'what the pane got, not what was asked').toBe('30');
            expect(el.position, 'the request itself is untouched — reset() means it').toBe(10);
            expect(el.getAttribute('position'), 'and connect is not a commit').toBe('10');
        });
    });

    describe('the seam is named', () => {
        it('the locale names the seam, and a label attribute wins', () => {
            const el = mount();
            const handle = handleOf(el);
            expect(handle.getAttribute('aria-label')).toBe(APARTE_DEFAULT_LOCALE.splitHandleLabel);
            expect(handle.getAttribute('aria-label')).toBe('Resize the panes');

            el.setAttribute('label', 'Drag to resize');
            expect(handle.getAttribute('aria-label')).toBe('Drag to resize');

            el.removeAttribute('label');
            aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, splitHandleLabel: 'Redimensionner les panneaux' });
            try {
                expect(handle.getAttribute('aria-label')).toBe('Redimensionner les panneaux');
            } finally {
                aparteGlobalConfig.setLocale(APARTE_DEFAULT_LOCALE);
            }
        });

        it('a host-authored aria-label is never overwritten', () => {
            const el = mount({}, '<div class="one"></div><div class="aparte-split__handle" aria-label="Mine"></div><div class="two"></div>');
            const handle = handleOf(el);
            expect(handle.getAttribute('aria-label')).toBe('Mine');
            aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, splitHandleLabel: 'Autre chose' });
            try {
                expect(handle.getAttribute('aria-label')).toBe('Mine');
            } finally {
                aparteGlobalConfig.setLocale(APARTE_DEFAULT_LOCALE);
            }
        });
    });

    describe('position', () => {
        it('attribute, property and the custom property agree', () => {
            const el = mount({ position: '38' });
            expect(el.position).toBe(38);
            expect(el.style.getPropertyValue('--aparte-split-position')).toBe('38%');

            el.position = 40;
            expect(el.getAttribute('position')).toBe('40');
            expect(el.style.getPropertyValue('--aparte-split-position')).toBe('40%');

            el.setAttribute('position', '25');
            expect(el.position).toBe(25);
            expect(el.style.getPropertyValue('--aparte-split-position')).toBe('25%');

            el.position = 150;
            expect(el.position).toBe(100);
            expect(el.getAttribute('position')).toBe('100');
            el.position = -20;
            expect(el.position).toBe(0);
            expect(el.getAttribute('position')).toBe('0');
        });

        it('a redundant set fires nothing', () => {
            const el = mount({ position: '38' });
            const seen = events(el);
            el.position = 40;
            el.position = 40;
            el.setAttribute('position', '40');
            expect(seen.map((d) => d.position)).toEqual([40]);
            expect(seen[0]!.source).toBe('api');
        });

        it('a collapsed attribute in the markup renders folded', () => {
            // The attribute callback fires during upgrade, before connect, and returns
            // early — so connect has to apply it or the attribute and the render disagree
            // from the first frame, and the first expand() widens something never narrow.
            const el = mount({ position: '38', collapsed: '' });
            fakeLayout(el);
            expect(el.collapsed).toBe(true);
            expect(el.style.getPropertyValue('--aparte-split-position')).toBe('0%');
            expect(el.position).toBe(0);

            const seen = events(el);
            el.expand();
            expect(el.position, 'back to the size the markup declared').toBe(38);
            expect(seen[0]).toMatchObject({ position: 38, collapsed: false });
        });

        it('upgrading server-rendered markup publishes nothing', () => {
            // The upgrade order is the trap. The element is ALREADY in the document, so
            // the custom-element reactions run `attributeChangedCallback` for every
            // authored attribute BEFORE `connectedCallback` — connected the whole time,
            // which is why the guard cannot be `isConnected`. Left ungated, the position
            // case commits a measurement of a layout the element has not set up yet: no
            // `data-stacked` written, so under the breakpoint the probe reads the stacked
            // pane, reflects a number the author never wrote over the one they did, and
            // sends it to the storage the guide tells hosts to write from.
            const seen: AparteSplitResizeDetail[] = [];
            const listener = (e: Event): void => { seen.push((e as CustomEvent<AparteSplitResizeDetail>).detail); };
            document.addEventListener('aparte-split-resize', listener);
            try {
                document.body.innerHTML =
                    `<aparte-split position="42" collapsed>${PANES}</aparte-split>`;
                const el = document.querySelector('aparte-split') as AparteSplit;
                expect(el, 'the definition is loaded, so this upgraded').toBeInstanceOf(HTMLElement);
                expect(el.getAttribute('position'), 'the authored value, untouched').toBe('42');
                expect(seen, 'and nothing was announced before the host could listen').toEqual([]);
            } finally {
                document.removeEventListener('aparte-split-resize', listener);
            }
        });

        it('an attribute change while disconnected fires nothing', () => {
            const el = mount({ position: '38' });
            const seen = events(el);
            el.remove();
            el.setAttribute('position', '55');
            expect(seen).toEqual([]);
            // …and connecting adopts it, still without an event.
            document.body.appendChild(el);
            expect(el.position).toBe(55);
            expect(seen).toEqual([]);
        });
    });

    describe('the keyboard', () => {
        it('each arrow steps one, shift steps ten', () => {
            const el = mount({ position: '40' });
            fakeLayout(el);
            const handle = handleOf(el);
            const seen = events(el);

            handle.dispatchEvent(key('keydown', 'ArrowRight'));
            expect(el.style.getPropertyValue('--aparte-split-position')).toBe('41%');
            expect(seen, 'the keydown moves, it does not commit').toEqual([]);
            handle.dispatchEvent(key('keyup', 'ArrowRight'));
            expect(seen).toHaveLength(1);
            expect(seen[0]).toMatchObject({ position: 41, source: 'keyboard', collapsed: false, stacked: false });
            expect(el.getAttribute('position')).toBe('41');
            expect(handle.getAttribute('aria-valuenow')).toBe('41');

            handle.dispatchEvent(key('keydown', 'ArrowRight', true));
            handle.dispatchEvent(key('keyup', 'ArrowRight', true));
            expect(seen[1]!.position).toBe(51);

            handle.dispatchEvent(key('keydown', 'ArrowLeft'));
            handle.dispatchEvent(key('keydown', 'ArrowLeft'));
            handle.dispatchEvent(key('keyup', 'ArrowLeft'));
            expect(seen, 'a key repeat commits once, on the release').toHaveLength(3);
            expect(seen[2]!.position).toBe(49);
        });

        it('Home and End reach the extremes', () => {
            const el = mount({ position: '40' });
            fakeLayout(el);
            const handle = handleOf(el);
            const seen = events(el);

            handle.dispatchEvent(key('keydown', 'Home'));
            handle.dispatchEvent(key('keyup', 'Home'));
            expect(seen[0]!.position).toBe(0);

            handle.dispatchEvent(key('keydown', 'End'));
            handle.dispatchEvent(key('keyup', 'End'));
            expect(seen[1]!.position).toBe(100);
        });

        it('Enter collapses and a second Enter restores the prior position', () => {
            const el = mount({ position: '40' });
            fakeLayout(el);
            const handle = handleOf(el);
            const seen = events(el);

            handle.dispatchEvent(key('keydown', 'Enter'));
            expect(el.collapsed).toBe(true);
            expect(seen[0]).toMatchObject({ position: 0, collapsed: true, source: 'keyboard' });

            handle.dispatchEvent(key('keydown', 'Enter'));
            expect(el.collapsed).toBe(false);
            expect(seen[1]).toMatchObject({ position: 40, collapsed: false, source: 'keyboard' });
        });

        it('the arrows follow the axis', () => {
            const el = mount({ position: '40' });
            const handle = handleOf(el);
            const seen = events(el);

            const up = key('keydown', 'ArrowUp');
            handle.dispatchEvent(up);
            expect(up.defaultPrevented, 'the page keeps its own block scrolling').toBe(false);

            el.setAttribute('orientation', 'vertical');
            const left = key('keydown', 'ArrowLeft');
            handle.dispatchEvent(left);
            expect(left.defaultPrevented).toBe(false);

            handle.dispatchEvent(key('keyup', 'ArrowUp'));
            handle.dispatchEvent(key('keyup', 'ArrowLeft'));
            expect(seen).toEqual([]);
            expect(el.position).toBe(40);
        });

        it('right-to-left swaps the arrows', () => {
            const el = mount({ position: '40' });
            fakeLayout(el);
            const handle = handleOf(el);
            const seen = events(el);
            vi.spyOn(window, 'getComputedStyle').mockReturnValue({ direction: 'rtl' } as CSSStyleDeclaration);

            handle.dispatchEvent(key('keydown', 'ArrowLeft'));
            handle.dispatchEvent(key('keyup', 'ArrowLeft'));
            expect(seen[0]!.position, 'in rtl the start pane grows to the left').toBe(41);

            el.setAttribute('orientation', 'vertical');
            handle.dispatchEvent(key('keydown', 'ArrowUp'));
            handle.dispatchEvent(key('keyup', 'ArrowUp'));
            expect(seen[1]!.position, 'the block axis never inverts').toBe(40);
        });

        it('focus leaving mid-key commits what the seam already shows', () => {
            const el = mount({ position: '40' });
            fakeLayout(el);
            const handle = handleOf(el);
            const seen = events(el);

            handle.dispatchEvent(key('keydown', 'ArrowRight'));
            expect(el.style.getPropertyValue('--aparte-split-position')).toBe('41%');
            // Alt-tab, a click into a pane, a host moving focus: the keyup never lands on
            // the seam, and without this the render, the attribute and the announcement
            // stay three different numbers for good.
            handle.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
            expect(seen).toHaveLength(1);
            expect(seen[0]).toMatchObject({ position: 41, source: 'keyboard' });
            expect(el.getAttribute('position')).toBe('41');
            expect(handle.getAttribute('aria-valuenow')).toBe('41');

            document.body.dispatchEvent(key('keyup', 'ArrowRight'));
            expect(seen, 'and the lost keyup commits nothing more').toHaveLength(1);
        });

        it('disabled removes the tab stop outright', () => {
            const el = mount({ position: '40', disabled: '' });
            const handle = handleOf(el);
            const seen = events(el);
            expect(handle.hasAttribute('tabindex')).toBe(false);
            expect(handle.hasAttribute('aria-disabled'), 'gone from the tab order, not announced as broken').toBe(false);

            handle.dispatchEvent(key('keydown', 'ArrowRight'));
            handle.dispatchEvent(key('keyup', 'ArrowRight'));
            handle.dispatchEvent(pointer('pointerdown', { clientX: 400 }));
            expect(el.querySelector('.aparte-split__scrim')).toBeNull();
            expect(seen).toEqual([]);

            el.removeAttribute('disabled');
            expect(handle.getAttribute('tabindex')).toBe('0');
        });
    });

    describe('the drag', () => {
        it('pointerdown appends the scrim inside the handle and does not capture', () => {
            const el = mount({ position: '38' });
            fakeLayout(el);
            const handle = handleOf(el);
            const capture = spyCapture(handle);

            handle.dispatchEvent(pointer('pointerdown', { clientX: 380 }));
            const scrim = el.querySelector<HTMLElement>('.aparte-split__scrim');
            expect(scrim).not.toBeNull();
            expect(handle.lastElementChild, 'a child of the handle, so dblclick still dispatches there').toBe(scrim);
            expect(scrim!.getAttribute('aria-hidden')).toBe('true');
            expect(handle.hasAttribute('data-dragging')).toBe(true);
            expect(document.activeElement).toBe(handle);
            expect(capture).not.toHaveBeenCalled();
        });

        it('capture waits for the first move', () => {
            const el = mount({ position: '38' });
            fakeLayout(el);
            const handle = handleOf(el);
            const capture = spyCapture(handle);
            const seen = events(el);

            handle.dispatchEvent(pointer('pointerdown', { clientX: 380 }));
            window.dispatchEvent(pointer('pointermove', { clientX: 480, buttons: 1 }));
            expect(capture).toHaveBeenCalledTimes(1);
            expect(capture).toHaveBeenCalledWith(7);
            expect(el.style.getPropertyValue('--aparte-split-position')).toBe('48%');
            expect(seen, 'no event during the drag').toEqual([]);

            window.dispatchEvent(pointer('pointermove', { clientX: 500, buttons: 1 }));
            expect(capture).toHaveBeenCalledTimes(1);

            window.dispatchEvent(pointer('pointerup', { clientX: 500, buttons: 0 }));
            expect(seen).toHaveLength(1);
            expect(seen[0]).toMatchObject({ position: 50, source: 'pointer' });
            expect(el.getAttribute('position')).toBe('50');
        });

        it('a pointer released with no buttons ends the drag', () => {
            const el = mount({ position: '38' });
            fakeLayout(el);
            const handle = handleOf(el);
            spyCapture(handle);
            const seen = events(el);

            handle.dispatchEvent(pointer('pointerdown', { clientX: 380 }));
            window.dispatchEvent(pointer('pointermove', { clientX: 480, buttons: 1 }));
            // The release happened over a cross-origin iframe, so no pointerup arrives —
            // the next move reports no buttons and that is the only end the drag gets.
            window.dispatchEvent(pointer('pointermove', { clientX: 480, buttons: 0 }));
            expect(el.querySelector('.aparte-split__scrim')).toBeNull();
            expect(handle.hasAttribute('data-dragging')).toBe(false);
            expect(seen).toHaveLength(1);
            expect(seen[0]!.source).toBe('pointer');
            expect(seen[0]!.position).toBe(48);

            window.dispatchEvent(pointer('pointermove', { clientX: 600, buttons: 1 }));
            expect(seen, 'the window listeners are gone').toHaveLength(1);
        });

        it('pointercancel ends the drag', () => {
            const el = mount({ position: '38' });
            fakeLayout(el);
            const handle = handleOf(el);
            spyCapture(handle);
            const seen = events(el);

            handle.dispatchEvent(pointer('pointerdown', { clientX: 380 }));
            window.dispatchEvent(pointer('pointermove', { clientX: 480, buttons: 1 }));
            window.dispatchEvent(pointer('pointercancel', { buttons: 0 }));
            expect(el.querySelector('.aparte-split__scrim')).toBeNull();
            expect(handle.hasAttribute('data-dragging')).toBe(false);
            expect(seen).toHaveLength(1);
            expect(seen[0]!.position).toBe(48);
        });

        it('Escape restores the position the drag started from', () => {
            const el = mount({ position: '38' });
            fakeLayout(el);
            const handle = handleOf(el);
            spyCapture(handle);
            const seen = events(el);

            handle.dispatchEvent(pointer('pointerdown', { clientX: 380 }));
            window.dispatchEvent(pointer('pointermove', { clientX: 600, buttons: 1 }));
            expect(el.style.getPropertyValue('--aparte-split-position')).toBe('60%');

            handle.dispatchEvent(key('keydown', 'Escape'));
            expect(el.querySelector('.aparte-split__scrim')).toBeNull();
            expect(seen).toHaveLength(1);
            expect(seen[0]!.position, 'the value the gesture started from').toBe(38);
            expect(el.getAttribute('position')).toBe('38');
        });

        it('a press on the seam that moves nothing commits nothing', async () => {
            const el = mount({ position: '38' });
            fakeLayout(el);
            const handle = handleOf(el);
            spyCapture(handle);
            const seen = events(el);

            handle.dispatchEvent(pointer('pointerdown', { clientX: 380 }));
            window.dispatchEvent(pointer('pointerup', { clientX: 380, buttons: 0 }));
            expect(seen, 'clicking the seam is how it takes focus').toEqual([]);
            expect(handle.hasAttribute('data-dragging')).toBe(false);
            // A press that never moved RETIRES its scrim rather than removing it: the
            // release happened over the overlay (nothing captured the pointer), and
            // WebKit works out what a click hit by walking that node's live ancestors —
            // take it out inside the handler and no `click`, and so no `dblclick`, is
            // fired at all, and the seam never resets. Measured on vanilla-webkit; the
            // event trace is in `e2e/tests/layout.spec.ts`. What has to be true HERE is
            // that the page is live again at once: the node is inert, and it leaves on
            // its own shortly after.
            const retired = el.querySelector<HTMLElement>('.aparte-split__scrim');
            expect(retired, 'still in the document, so the click can be resolved').not.toBeNull();
            expect(retired!.style.pointerEvents, 'and inert, so the page is not dead').toBe('none');

            // …which is why a double-click sends one event, the reset, and not three.
            handle.dispatchEvent(pointer('pointerdown', { clientX: 380 }));
            window.dispatchEvent(pointer('pointerup', { clientX: 380, buttons: 0 }));
            handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            expect(seen).toHaveLength(1);
            expect(seen[0]).toMatchObject({ position: 38, source: 'api' });
        });

        it('a retired overlay leaves the document on its own', () => {
            // The other half of the retirement, and the half nothing else can see: the
            // node goes inert at once (asserted above) and is removed a moment later.
            // Drop the timer and every assertion in this file stays green while a
            // consuming app collects one `position: fixed` overlay per press of the seam.
            vi.useFakeTimers();
            try {
                const el = mount({ position: '38' });
                fakeLayout(el);
                const handle = handleOf(el);
                spyCapture(handle);

                for (let i = 0; i < 10; i++) {
                    handle.dispatchEvent(pointer('pointerdown', { clientX: 380 }));
                    window.dispatchEvent(pointer('pointerup', { clientX: 380, buttons: 0 }));
                }
                expect(el.querySelectorAll('.aparte-split__scrim'), 'each press retires its own').toHaveLength(10);

                vi.advanceTimersByTime(400);
                expect(el.querySelectorAll('.aparte-split__scrim'), 'and nothing piles up').toHaveLength(0);
            } finally {
                vi.useRealTimers();
            }
        });

        it('a second pointer does not end the first one\'s drag', () => {
            const el = mount({ position: '38' });
            fakeLayout(el);
            const handle = handleOf(el);
            spyCapture(handle);
            const seen = events(el);

            handle.dispatchEvent(pointer('pointerdown', { clientX: 380 }));
            window.dispatchEvent(pointer('pointermove', { clientX: 480, buttons: 1 }));

            // A hovering pen on a touchscreen laptop: another pointer, no buttons down.
            const stray = pointer('pointermove', { clientX: 900, buttons: 0 });
            Object.defineProperty(stray, 'pointerId', { value: 9, configurable: true });
            window.dispatchEvent(stray);
            expect(seen, 'the mouse drag is still in flight').toEqual([]);
            expect(el.style.getPropertyValue('--aparte-split-position')).toBe('48%');

            window.dispatchEvent(pointer('pointerup', { clientX: 480, buttons: 0 }));
            expect(seen).toHaveLength(1);
        });

        it('primary="end" moves the seam toward the pointer, not away from it', () => {
            const el = mount({ position: '38', primary: 'end' });
            fakeLayout(el, 1000, 2);
            const handle = handleOf(el);
            spyCapture(handle);
            const seen = events(el);

            handle.dispatchEvent(pointer('pointerdown', { clientX: 616 }));
            window.dispatchEvent(pointer('pointermove', { clientX: 716, buttons: 1 }));
            expect(el.style.getPropertyValue('--aparte-split-position'), 'the end pane gives way').toBe('28%');
            window.dispatchEvent(pointer('pointerup', { clientX: 716, buttons: 0 }));
            expect(seen[0]!.position).toBe(28);

            handle.dispatchEvent(key('keydown', 'ArrowRight'));
            handle.dispatchEvent(key('keyup', 'ArrowRight'));
            expect(seen[1]!.position, 'and ArrowRight follows the seam too').toBe(27);

            handle.dispatchEvent(key('keydown', 'Home'));
            handle.dispatchEvent(key('keyup', 'Home'));
            expect(seen[2]!.position, "Home is still the primary pane's minimum").toBe(0);
        });

        it('a double click resets to the position present at connect', () => {
            const el = mount({ position: '38' });
            fakeLayout(el);
            const handle = handleOf(el);
            const seen = events(el);

            handle.dispatchEvent(key('keydown', 'ArrowRight', true));
            handle.dispatchEvent(key('keyup', 'ArrowRight', true));
            expect(el.position).toBe(48);

            handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            expect(el.position).toBe(38);
            expect(seen[1]).toMatchObject({ position: 38, source: 'api' });
        });

        it('a re-parent restores the split, it does not redefine what reset() goes back to', () => {
            const el = mount({ position: '38' });
            fakeLayout(el);
            const handle = handleOf(el);

            handle.dispatchEvent(key('keydown', 'ArrowRight', true));
            handle.dispatchEvent(key('keyup', 'ArrowRight', true));
            expect(el.position).toBe(48);
            expect(el.getAttribute('position')).toBe('48');

            // A framework re-render, a tab switch, a drag-and-drop of the panel: the same
            // element, moved. Its authored position is what it was authored with.
            const host = document.createElement('div');
            document.body.appendChild(host);
            host.appendChild(el);
            fakeLayout(el);

            el.reset();
            expect(el.position, 'the markup said 38; the last drag did not rewrite the markup').toBe(38);
        });

        it('a split moved while folded reopens at the size it had', () => {
            const el = mount({ position: '38' });
            fakeLayout(el);
            el.collapse();
            expect(el.position).toBe(0);

            const host = document.createElement('div');
            document.body.appendChild(host);
            host.appendChild(el);
            fakeLayout(el);

            expect(el.collapsed, 'it left folded and it comes back folded').toBe(true);
            el.expand();
            expect(el.position, 'expand() reopens it, it does not leave it at zero').toBe(38);
        });
    });

    describe('one pane at a time', () => {
        it('the breakpoint stacks and unstacks', () => {
            const el = mount({ position: '38' });
            const handle = handleOf(el);

            narrow(true);
            expect(el.stacked).toBe(true);
            expect(el.hasAttribute('data-stacked')).toBe(true);
            expect(el.getAttribute('pane'), 'the chat, never a preview of nothing').toBe('start');
            expect(handle.hasAttribute('tabindex'), 'a hidden seam is no tab stop').toBe(false);

            narrow(false);
            expect(el.stacked).toBe(false);
            expect(el.hasAttribute('pane')).toBe(false);
            expect(handle.getAttribute('tabindex')).toBe('0');
        });

        it('<aparte-split pane="end"> loading on a narrow screen keeps the pane its markup named', () => {
            // `mediaMatches` BEFORE the mount: every other case in this file crosses the
            // breakpoint after connecting, which is why the suite is green on this.
            mediaMatches = true;
            const el = mount({ position: '38', pane: 'end' });
            expect(el.stacked).toBe(true);
            expect(el.getAttribute('pane'), 'the markup chose the pane, not the mount').toBe('end');

            const seen = events(el);
            el.showPane('start');
            expect(seen.at(-1), 'and the switch after it is announced').toMatchObject({ pane: 'start', stacked: true });
            el.showPane('end');
            expect(seen.at(-1)).toMatchObject({ pane: 'end', stacked: true });
            expect(seen).toHaveLength(2);
        });

        it('breakpoint="none" over a CSS-stacked split leaves the authored pane alone', () => {
            // `.aparte-split--only-end` is the stacked state as the recipe writes it. The
            // element's own breakpoint is off, so nothing was crossed — and unstacking a
            // split that never stacked must not delete what the markup asked for.
            const el = mount({ position: '38', pane: 'end', breakpoint: 'none', class: 'aparte-split--only-end' });
            expect(el.stacked).toBe(true);
            expect(el.getAttribute('pane'), 'no breakpoint was crossed; nothing to restore').toBe('end');
        });

        it('stacking keeps the position instead of measuring a hidden pane', () => {
            const el = mount({ position: '38' });
            fakeLayout(el);
            const seen = events(el);

            narrow(true);
            // While stacked one pane is display:none and the other spans the single
            // track, so the ratio is 0 or 100 whatever the seam was set to. Measuring it
            // is how tapping "Preview" on a phone wrote position="0" into the host's
            // storage — and widening the window then reopened the split at the wrong size.
            Object.defineProperty(el.children[0] as HTMLElement, 'getBoundingClientRect', {
                configurable: true,
                value: () => rect(0),
            });
            el.showPane('end');
            expect(el.getAttribute('position')).toBe('38');
            expect(el.position).toBe(38);
            expect(seen.at(-1)).toMatchObject({ position: 38, pane: 'end', stacked: true });

            fakeLayout(el); // widening puts the two-pane layout back
            narrow(false);
            expect(el.position, 'and it comes back to the size it was left at').toBe(38);
            expect(el.getAttribute('position')).toBe('38');
        });

        it('the CSS route stacks it too, and every guard reads that', () => {
            // `.aparte-split--only-start` / `--only-end` are the recipe form of the
            // stacked state, for a host that owns its own breakpoints and turns the
            // element's off. The sheet gives them rules byte-identical to the ones
            // `data-stacked` selects, so the element has to read them the same way —
            // otherwise the seam keeps a tab stop nothing can see and the first commit
            // measures the one-track grid and writes `position="100"`.
            const el = mount({ position: '38', breakpoint: 'none', class: 'aparte-split--only-start' });
            fakeLayout(el);
            // The shown pane spans the whole container, which is what the sheet draws.
            Object.defineProperty(el.children[0] as HTMLElement, 'getBoundingClientRect', {
                configurable: true,
                value: () => rect(1000),
            });
            const seen = events(el);

            expect(el.stacked).toBe(true);
            expect(handleOf(el).hasAttribute('tabindex'), 'a hidden seam is no tab stop').toBe(false);

            el.showPane('end');
            expect(el.getAttribute('position'), 'not the 100 a single track measures').toBe('38');
            expect(seen.at(-1)).toMatchObject({ position: 38, pane: 'end', stacked: true });
        });

        it('breakpoint="none" never asks matchMedia', () => {
            mount({ breakpoint: 'none' });
            expect(mediaCalls).toBe(0);
            const el = mount({ breakpoint: '40rem' });
            expect(mediaCalls).toBe(1);
            expect(el.stacked).toBe(false);
        });

        it('no matchMedia is not a crash', () => {
            const saved = (globalThis as unknown as { matchMedia: unknown }).matchMedia;
            delete (globalThis as unknown as { matchMedia?: unknown }).matchMedia;
            try {
                expect(() => mount({ position: '38' })).not.toThrow();
                expect(document.querySelector('aparte-split')!.hasAttribute('data-stacked')).toBe(false);
            } finally {
                (globalThis as unknown as { matchMedia: unknown }).matchMedia = saved;
            }
        });

        it('a [data-aparte-split-pane] button switches the pane', () => {
            const el = mount({ position: '38' });
            const other = mount({ position: '38', id: 'second' });
            narrow(true);
            expect(el.pane).toBe('start');

            const toEnd = document.createElement('button');
            toEnd.setAttribute('data-aparte-split-pane', 'end');
            document.body.appendChild(toEnd);
            toEnd.click();
            expect(el.pane, 'the first split on the page').toBe('end');
            expect(other.pane).toBe('start');

            const toStart = document.createElement('button');
            toStart.setAttribute('data-aparte-split-pane', 'start');
            document.body.appendChild(toStart);
            toStart.click();
            expect(el.pane).toBe('start');

            const named = document.createElement('button');
            named.setAttribute('data-aparte-split-pane', 'second');
            document.body.appendChild(named);
            named.click();
            expect(other.pane, 'the split whose id it names').toBe('end');
            expect(el.pane, 'and only that one').toBe('start');

            // An empty value is the nearest split — for a control sitting inside one,
            // its own, not the first on the page.
            const inner = document.createElement('button');
            inner.setAttribute('data-aparte-split-pane', '');
            (other.children[0] as HTMLElement).appendChild(inner);
            inner.click();
            expect(other.pane, 'the split it sits in, toggled').toBe('start');
            expect(el.pane, 'and the first on the page is left alone').toBe('start');

            const foreign = document.createElement('button');
            foreign.setAttribute('data-aparte-split-pane', 'no-such-split');
            document.body.appendChild(foreign);
            foreign.click();
            expect(el.pane, 'a value naming nothing on the page moves nothing').toBe('start');
            expect(other.pane).toBe('start');
        });
    });

    it('disconnect removes every listener and any scrim', () => {
        const el = mount({ position: '38' });
        fakeLayout(el);
        const handle = handleOf(el);
        spyCapture(handle);
        const seen = events(el);
        const button = document.createElement('button');
        button.setAttribute('data-aparte-split-pane', 'end');
        document.body.appendChild(button);

        handle.dispatchEvent(pointer('pointerdown', { clientX: 380 }));
        expect(el.querySelector('.aparte-split__scrim')).not.toBeNull();

        el.remove();
        expect(el.querySelector('.aparte-split__scrim'), 'a stuck scrim makes the page dead to the pointer').toBeNull();
        expect(document.querySelector('.aparte-split__scrim')).toBeNull();
        expect(handle.hasAttribute('data-dragging')).toBe(false);

        window.dispatchEvent(pointer('pointermove', { clientX: 600, buttons: 1 }));
        window.dispatchEvent(pointer('pointerup', { buttons: 0 }));
        handle.dispatchEvent(key('keydown', 'ArrowRight'));
        handle.dispatchEvent(key('keyup', 'ArrowRight'));
        button.click();
        narrow(true);
        expect(seen).toEqual([]);
        expect(el.hasAttribute('data-stacked')).toBe(false);
    });
});
