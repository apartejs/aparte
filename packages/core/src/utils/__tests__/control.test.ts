import { describe, it, expect } from 'vitest';
import { APARTE_CONTROL_CLASS, controlClassList, controlMarkup, createControl } from '../control.js';

const parse = (html: string): HTMLButtonElement => {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.firstElementChild as HTMLButtonElement;
};

describe('controlClassList', () => {
    it('puts the element-scoped part first, then modifiers', () => {
        expect(controlClassList({
            part: 'aparte-chat-bubble__action',
            modifiers: ['aparte-chat-bubble__action--copy'],
            label: 'Copy',
        })).toBe('aparte-chat-bubble__action aparte-chat-bubble__action--copy');
    });

    it('adds the shared icon look ONLY when asked', () => {
        const spec = { part: 'aparte-composer-send__button', label: 'Send' } as const;
        expect(controlClassList(spec)).not.toContain(APARTE_CONTROL_CLASS);
        expect(controlClassList({ ...spec, look: 'icon' })).toContain(APARTE_CONTROL_CLASS);
    });

    it('keeps the shared look off the send button, whose rule it would override', () => {
        // Not a style preference: `.aparte-control` sets `background: transparent` and its
        // rule sits AFTER the send button's in the stylesheet, so at equal specificity it
        // wins — a blanket application would strip the one filled control of its colour.
        expect(controlClassList({ part: 'aparte-composer-send__button', label: 'Send' }))
            .toBe('aparte-composer-send__button');
    });
});

describe('controlMarkup', () => {
    it('always sets type="button"', () => {
        // The reason this helper exists as much as the naming is: a <button> with no type
        // inside a consumer's <form> defaults to submit. Fourteen of core's controls had
        // shipped without one — every button in the bubble's action bar, both branch
        // arrows, the send button and the stop button among them.
        expect(parse(controlMarkup({ part: 'aparte-x__button', label: 'X' })).type).toBe('button');
    });

    it('puts the label on both aria-label and title', () => {
        const el = parse(controlMarkup({ part: 'aparte-x__button', label: 'Attach file' }));
        expect(el.getAttribute('aria-label')).toBe('Attach file');
        expect(el.getAttribute('title')).toBe('Attach file');
    });

    it('escapes a label that would otherwise break out of the attribute', () => {
        const el = parse(controlMarkup({
            part: 'aparte-x__button',
            label: 'x" onmouseover="alert(1)',
        }));
        expect(el.getAttribute('onmouseover')).toBeNull();
        expect(el.getAttribute('aria-label')).toBe('x" onmouseover="alert(1)');
    });

    it('escapes data values too', () => {
        const el = parse(controlMarkup({
            part: 'aparte-x__button',
            label: 'X',
            data: { action: 'custom:a" data-evil="1' },
        }));
        expect(el.getAttribute('data-evil')).toBeNull();
        expect(el.dataset['action']).toBe('custom:a" data-evil="1');
    });

    it('carries disabled and hidden through', () => {
        const el = parse(controlMarkup({
            part: 'aparte-x__button', label: 'X', disabled: true, hidden: true,
        }));
        expect(el.disabled).toBe(true);
        expect(el.hidden).toBe(true);
    });

    it('interpolates the icon verbatim, because escaping it would print the source', () => {
        const el = parse(controlMarkup({
            part: 'aparte-x__button', label: 'X', icon: '<svg data-icon="copy"></svg>',
        }));
        expect(el.querySelector('svg')?.getAttribute('data-icon')).toBe('copy');
    });
});

describe('createControl', () => {
    it('matches controlMarkup on class, type and accessible name', () => {
        const spec = { part: 'aparte-x__button', label: 'X', look: 'icon' } as const;
        const built = createControl(spec);
        const stamped = parse(controlMarkup(spec));
        expect(built.className).toBe(stamped.className);
        expect(built.type).toBe(stamped.type);
        expect(built.getAttribute('aria-label')).toBe(stamped.getAttribute('aria-label'));
    });

    it('sets a consumer label as an attribute, so markup in it stays text', () => {
        // This path exists for the bubble's registered actions, whose label is the app's.
        const el = createControl({ part: 'aparte-x__button', label: '<img src=x onerror=alert(1)>' });
        expect(el.querySelector('img')).toBeNull();
        expect(el.getAttribute('aria-label')).toBe('<img src=x onerror=alert(1)>');
    });
});
