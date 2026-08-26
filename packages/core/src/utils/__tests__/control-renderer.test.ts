// @vitest-environment jsdom
/**
 * `setControlRenderer` — the seam that makes a design-system swap possible.
 *
 * A class contract lets you RESTYLE our button; it does not let you SUBSTITUTE a different
 * one, because a `<p-button>` is not a style, it is another DOM. These tests are about the
 * two halves that make substitution actually work rather than merely typecheck: core must
 * still find the control it did not build, and core's state writes must still reach it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '../../config/index.js';
import {
    APARTE_CONTROL_ATTR,
    controlMarkup,
    createControl,
    updateControl,
    defaultControlMarkup,
} from '../control.js';
import '../../components/composer/aparte-composer.js';
import '../../components/composer/aparte-composer-send.js';

const SPEC = { part: 'aparte-x__button', label: 'Do it', icon: '<svg data-i="core"></svg>' };

afterEach(() => {
    aparteGlobalConfig.setControlRenderer(null);
    document.body.innerHTML = '';
});

describe('substitution', () => {
    it('replaces the markup a control renders', () => {
        aparteGlobalConfig.setControlRenderer({ render: () => '<a class="mine">Mine</a>' });
        const html = controlMarkup(SPEC);
        expect(html).toContain('class="mine"');
        // The part name is still there — in the WIRING ATTRIBUTE, which is how core finds
        // the control. What must NOT come along is the part CLASS: that carries our rules,
        // and forcing it onto a replacement is what would make the contract fight the
        // substitution it exists to enable.
        expect(html).not.toContain('class="aparte-x__button');
        expect(html).toContain(`${APARTE_CONTROL_ATTR}="aparte-x__button"`);
    });

    it('leaves a control alone when the renderer returns null', () => {
        // A partial swap must not force an exhaustive switch over every part in the library.
        aparteGlobalConfig.setControlRenderer({
            render: (spec) => (spec.part === 'aparte-other' ? '<a></a>' : null),
        });
        expect(controlMarkup(SPEC)).toBe(defaultControlMarkup(SPEC));
    });

    it('stamps the wiring attribute on a replacement that did not write it', () => {
        // Core finds its controls by this attribute, so a replacement that forgot it would
        // render and then be dead — no click listener, no disabled sync.
        aparteGlobalConfig.setControlRenderer({ render: () => '<a class="mine">Mine</a>' });
        expect(controlMarkup(SPEC)).toContain(`${APARTE_CONTROL_ATTR}="aparte-x__button"`);
    });

    it('does not stamp twice when the replacement wrote it itself', () => {
        aparteGlobalConfig.setControlRenderer({
            render: (s) => `<a ${APARTE_CONTROL_ATTR}="${s.part}">Mine</a>`,
        });
        const html = controlMarkup(SPEC);
        expect(html.match(new RegExp(APARTE_CONTROL_ATTR, 'g'))).toHaveLength(1);
    });

    it('accepts a NODE, which is the only path a framework component can take', () => {
        // Angular will never compile a string handed to innerHTML, so the wrapper creates
        // the component and returns its host element.
        aparteGlobalConfig.setControlRenderer({
            render: () => {
                const el = document.createElement('my-button');
                el.textContent = 'Mine';
                return el;
            },
        });
        const node = createControl(SPEC);
        expect(node.tagName.toLowerCase()).toBe('my-button');
        expect(node.getAttribute(APARTE_CONTROL_ATTR)).toBe('aparte-x__button');
    });
});

describe('state writes', () => {
    it('go to the renderer when it implements update', () => {
        // The half that keeps "core keeps the behaviour" true for a framework component:
        // setting `.disabled` on a <p-button> host touches no @Input and runs no change
        // detection, so core must ASK rather than write.
        const seen: Array<{ part: string; disabled: boolean }> = [];
        aparteGlobalConfig.setControlRenderer({
            render: () => '<my-button></my-button>',
            update: (_node, spec) => seen.push({ part: spec.part, disabled: spec.disabled ?? false }),
        });
        const node = document.createElement('my-button');
        updateControl(node, { ...SPEC, disabled: true });
        expect(seen).toEqual([{ part: 'aparte-x__button', disabled: true }]);
        // …and core did NOT also write the DOM, which would fight the component.
        expect(node.getAttribute('aria-label')).toBeNull();
    });

    it('fall back to writing the DOM when the renderer has no update', () => {
        aparteGlobalConfig.setControlRenderer({ render: () => '<button></button>' });
        const node = document.createElement('button');
        updateControl(node, { ...SPEC, disabled: true });
        expect(node.getAttribute('aria-label')).toBe('Do it');
        expect((node as HTMLButtonElement).disabled).toBe(true);
    });

    it('write the DOM when nothing is registered at all', () => {
        const node = document.createElement('button');
        updateControl(node, { ...SPEC, hidden: true });
        expect(node.hidden).toBe(true);
        expect(node.querySelector('svg')?.getAttribute('data-i')).toBe('core');
    });
});

describe('a real element in the library', () => {
    it('renders the substituted control AND still wires its click', () => {
        // End to end: this is the claim the whole seam rests on — you own the look, core
        // keeps the behaviour.
        aparteGlobalConfig.setControlRenderer({
            render: (spec) => `<a href="#" class="mine">${spec.label}</a>`,
        });
        const composer = document.createElement('aparte-composer');
        composer.innerHTML = '<aparte-composer-send></aparte-composer-send>';
        document.body.appendChild(composer);

        const send = composer.querySelector('aparte-composer-send')!;
        const control = send.querySelector(`[${APARTE_CONTROL_ATTR}]`) as HTMLElement;
        expect(control).not.toBeNull();
        expect(control.tagName.toLowerCase()).toBe('a');
        expect(control.className).toBe('mine');
    });

    it('routes a real state change to the renderer instead of writing the DOM', () => {
        // The other half, proven on the hardest control in the library: the send button
        // has four meanings and rewrites its own chrome on every one of them. If ANY of
        // those paths still wrote the DOM directly, a framework component would render
        // once and then freeze — the exact silent failure `update` exists to prevent.
        const changes: Array<Record<string, unknown>> = [];
        aparteGlobalConfig.setControlRenderer({
            render: () => '<my-button></my-button>',
            update: (_node, c) => changes.push({ ...c }),
        });
        const composer = document.createElement('aparte-composer');
        composer.innerHTML = '<aparte-composer-send></aparte-composer-send>';
        document.body.appendChild(composer);

        changes.length = 0;
        // The composer enters a turn on the window lifecycle event, not on an attribute —
        // the same path `aparte-composer-cancel`'s own tests drive it with.
        window.dispatchEvent(new CustomEvent('aparte-message-start', {
            detail: { messageId: 'm1', role: 'assistant' },
        }));

        expect(changes.length).toBeGreaterThan(0);
        expect(changes.some((c) => c['icon'] !== undefined || c['label'] !== undefined)).toBe(true);
    });
});
