// @vitest-environment jsdom
/**
 * `overlay-composer`: the viewport measures the floating bottom stack and
 * publishes `--aparte-bottom-inset`.
 *
 * jsdom computes no layout, so the GEOMETRY (does the inset match the stack, does
 * the button clear it) lives in `e2e/tests/layout.spec.ts` — what belongs here is
 * the WIRING, driven through mocked observers the way `resize-rederives-button`
 * does: the mode is read from the shell, the stack (not the viewport itself) is
 * what gets observed, the var is written on resize and only when it changed, a
 * late-mounting stack child is picked up, and a viewport outside the mode writes
 * nothing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const roCallbacks: Array<() => void> = [];
const observed: Element[] = [];

class CapturingResizeObserver {
    constructor(cb: () => void) { roCallbacks.push(cb); }
    observe(el: Element): void { if (!observed.includes(el)) observed.push(el); }
    unobserve(): void {}
    disconnect(): void {}
}

/** Give an element a fake rect — jsdom's own answer is all zeros. */
function mockRect(el: HTMLElement, rect: { top: number; bottom: number; height: number }): void {
    el.getBoundingClientRect = () => ({
        top: rect.top, bottom: rect.bottom, height: rect.height,
        left: 0, right: 0, width: 0, x: 0, y: rect.top,
        toJSON: () => ({}),
    }) as DOMRect;
}

beforeEach(async () => {
    roCallbacks.length = 0;
    observed.length = 0;
    vi.stubGlobal('ResizeObserver', CapturingResizeObserver);
    await import('../aparte-chat-viewport.js');
    await customElements.whenDefined('aparte-chat-viewport');
});

afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

function mountOverlay(): { chat: HTMLElement; vp: HTMLElement; composer: HTMLElement } {
    const chat = document.createElement('aparte-chat');
    chat.setAttribute('overlay-composer', '');
    const vp = document.createElement('aparte-chat-viewport');
    const composer = document.createElement('aparte-composer');
    // The default composition would build its own children; hand the shell a
    // viewport so it keeps this markup (the documented descendant test).
    chat.append(vp, composer);
    document.body.appendChild(chat);
    return { chat, vp, composer };
}

describe('overlay-composer wiring', () => {
    it('observes the stack, measures from its top edge, and writes the var on the host', () => {
        const { vp, composer } = mountOverlay();
        mockRect(vp, { top: 0, bottom: 600, height: 600 });
        mockRect(composer, { top: 470, bottom: 590, height: 120 });

        expect(observed, 'the composer is a resize target').toContain(composer);
        expect(observed, 'the viewport never observes itself as stack').not.toContain(vp);

        // Drive every captured callback — the component's own is among them.
        for (const cb of roCallbacks) cb();
        expect(vp.style.getPropertyValue('--aparte-bottom-inset'), 'inset = viewport bottom - stack top').toBe('130px');
    });

    it('skips the write when the value has not changed, and follows a real change', () => {
        const { vp, composer } = mountOverlay();
        mockRect(vp, { top: 0, bottom: 600, height: 600 });
        mockRect(composer, { top: 470, bottom: 590, height: 120 });
        for (const cb of roCallbacks) cb();

        vp.style.setProperty('--aparte-bottom-inset', 'sentinel');
        for (const cb of roCallbacks) cb();
        expect(vp.style.getPropertyValue('--aparte-bottom-inset'), 'same geometry, no rewrite').toBe('sentinel');

        mockRect(composer, { top: 420, bottom: 590, height: 170 });
        for (const cb of roCallbacks) cb();
        expect(vp.style.getPropertyValue('--aparte-bottom-inset'), 'the composer grew 50px').toBe('180px');
    });

    it('a stack child that mounts later is observed and measured', async () => {
        const { chat, vp, composer } = mountOverlay();
        mockRect(vp, { top: 0, bottom: 600, height: 600 });
        mockRect(composer, { top: 470, bottom: 590, height: 120 });
        for (const cb of roCallbacks) cb();

        const elicitation = document.createElement('aparte-elicitation');
        mockRect(elicitation, { top: 400, bottom: 470, height: 70 });
        chat.insertBefore(elicitation, composer);
        // The childList MutationObserver is real (only ResizeObserver is mocked).
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));

        expect(observed, 'the late child is a resize target').toContain(elicitation);
        expect(vp.style.getPropertyValue('--aparte-bottom-inset'), 'measured from the new, higher top').toBe('200px');
    });

    it('outside overlay mode, nothing is observed and nothing is written', () => {
        const chat = document.createElement('aparte-chat');
        const vp = document.createElement('aparte-chat-viewport');
        const composer = document.createElement('aparte-composer');
        chat.append(vp, composer);
        document.body.appendChild(chat);
        mockRect(vp, { top: 0, bottom: 600, height: 600 });
        mockRect(composer, { top: 470, bottom: 590, height: 120 });

        for (const cb of roCallbacks) cb();
        expect(observed, 'no stack targets without the attribute').not.toContain(composer);
        expect(vp.style.getPropertyValue('--aparte-bottom-inset'), 'no var without the attribute').toBe('');
    });
});
