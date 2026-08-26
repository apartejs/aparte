// @vitest-environment jsdom
/**
 * `<aparte-button>` — the element over `.aparte-control`.
 *
 * The class contract is the primitive, so what this element has to earn is the three
 * things a class cannot do: resolve an icon through the configured provider, guarantee
 * `type="button"`, and give an icon-only button an accessible name. Those are the tests
 * that matter; the rest is the modifier arithmetic, which is exactly the kind of mapping
 * that drifts silently once a fifth accent is added.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-button.js';
import { aparteGlobalConfig } from '../../../config/index.js';

function mount(attrs: Record<string, string> = {}): HTMLElement {
    const el = document.createElement('aparte-button');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
}
const button = (el: HTMLElement) => el.querySelector('button') as HTMLButtonElement;
const classes = (el: HTMLElement) => [...button(el).classList];

afterEach(() => {
    document.body.innerHTML = '';
});

describe('the default', () => {
    it('renders a real button, typed, wearing the base class and nothing else', () => {
        const el = mount({ label: 'Save' });
        expect(button(el).type).toBe('button');
        expect(classes(el)).toContain('aparte-control');
        // `quiet`, `neutral` and `md` ARE the base rule, so they must add no modifier —
        // otherwise `.aparte-control` alone would stop being a complete control.
        expect(classes(el)).not.toContain('aparte-control--quiet');
        expect(classes(el)).not.toContain('aparte-control--neutral');
        expect(classes(el)).not.toContain('aparte-control--md');
    });

    it('always writes type="button", which is half of why this element exists', () => {
        // A <button> with no type inside a form submits it. Fourteen of core's own
        // controls shipped without one before they moved behind the shared builder.
        const form = document.createElement('form');
        document.body.appendChild(form);
        const el = document.createElement('aparte-button');
        el.setAttribute('label', 'Go');
        form.appendChild(el);
        expect((el.querySelector('button') as HTMLButtonElement).type).toBe('button');
    });
});

describe('the four axes', () => {
    it('adds one modifier per non-default axis', () => {
        const el = mount({ variant: 'filled', accent: 'primary', size: 'lg', shape: 'circle', label: 'Send' });
        expect(classes(el)).toEqual(
            expect.arrayContaining([
                'aparte-control',
                'aparte-control--filled',
                'aparte-control--primary',
                'aparte-control--lg',
                'aparte-control--circle',
            ]),
        );
    });

    it('falls back to the default on an unknown value rather than emitting it', () => {
        // An unknown modifier class would silently style nothing, which is worse than
        // rendering the default: the button looks wrong and the class list looks right.
        const el = mount({ variant: 'gradient', accent: 'chartreuse', size: 'xxl', label: 'X' });
        expect(classes(el).filter((c) => c.startsWith('aparte-control--'))).toEqual(['aparte-control--label']);
    });

    it('re-renders when an attribute changes', () => {
        const el = mount({ label: 'X' });
        expect(classes(el)).not.toContain('aparte-control--danger');
        el.setAttribute('accent', 'danger');
        expect(classes(el)).toContain('aparte-control--danger');
    });
});

describe('label and icon', () => {
    it('a labelled button is no longer square, and carries its text', () => {
        const el = mount({ label: 'Delete' });
        expect(classes(el)).toContain('aparte-control--label');
        expect(button(el).querySelector('.aparte-control__label')?.textContent).toBe('Delete');
    });

    it('icon-only keeps the accessible name and drops the visible text', () => {
        const el = mount({ label: 'Copy', 'icon-only': '', icon: '<svg data-i="c"></svg>' });
        expect(button(el).getAttribute('aria-label')).toBe('Copy');
        expect(button(el).querySelector('.aparte-control__label')).toBeNull();
        expect(button(el).querySelector('svg')).not.toBeNull();
        expect(classes(el)).not.toContain('aparte-control--label');
    });

    it('does not let a label break out of the attribute', () => {
        const el = mount({ label: 'x" onmouseover="alert(1)' });
        expect(button(el).getAttribute('onmouseover')).toBeNull();
        expect(button(el).getAttribute('aria-label')).toBe('x" onmouseover="alert(1)');
    });

    it('resolves an icon KEY through the configured provider', () => {
        // The one thing a class cannot do, and the reason a plugin author reaches for the
        // element: the glyph follows the host's icon set instead of being copied in.
        aparteGlobalConfig.setIconProvider({ copy: () => '<svg data-from="provider"></svg>' });
        const el = mount({ icon: 'copy', label: 'Copy', 'icon-only': '' });
        expect(button(el).querySelector('svg')?.getAttribute('data-from')).toBe('provider');
    });

    it('passes raw markup through untouched when the icon starts with <', () => {
        const el = mount({ icon: '<svg data-i="raw"></svg>', label: 'Raw', 'icon-only': '' });
        expect(button(el).querySelector('svg')?.getAttribute('data-i')).toBe('raw');
    });
});

describe('the event', () => {
    it('bubbles, so a framework binds it like any element event', () => {
        const el = mount({ label: 'Go', 'action-id': 'save' });
        const seen: string[] = [];
        document.body.addEventListener('aparte-button-click', (e) => {
            seen.push((e as CustomEvent<{ actionId: string }>).detail.actionId);
        });
        button(el).click();
        expect(seen).toEqual(['save']);
    });

    it('carries an empty actionId rather than undefined when none is set', () => {
        const el = mount({ label: 'Go' });
        let detail: unknown;
        el.addEventListener('aparte-button-click', (e) => { detail = (e as CustomEvent).detail; });
        button(el).click();
        expect(detail).toEqual({ actionId: '' });
    });
});

describe('the render guard', () => {
    it('steps aside for a child already carrying the class', () => {
        const el = document.createElement('aparte-button');
        el.setAttribute('label', 'Mine');
        el.innerHTML = '<button class="aparte-control" data-mine="1">Mine</button>';
        document.body.appendChild(el);
        expect(button(el).dataset['mine']).toBe('1');
        expect(el.querySelectorAll('button')).toHaveLength(1);
    });

    it('disables the inner button', () => {
        expect(button(mount({ label: 'X', disabled: '' })).disabled).toBe(true);
    });
});
