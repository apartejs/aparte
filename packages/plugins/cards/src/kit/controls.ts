/**
 * Controls a card can carry: a row of choices, a switch, a slider. Each reports through
 * `ctx.change(name, value)`, so the card fires `aparte-card-change` and the app's
 * `onChange` answers with new data, drawn in place — a stock chart's range, a light's
 * brightness.
 *
 * A control is drawn only when something will answer it (`ctx.live`): without an
 * `onChange`, a button that does nothing would be a promise the card cannot keep
 * (ratified decision #8). Each control carries a `data-card-key`, so a redraw puts the
 * focus back on the control that was pressed.
 */
import type { CardContext } from './define.js';
import { el } from './dom.js';

export interface SegmentedOptions {
    /** The control's name in the change (`range`). */
    name: string;
    /** The choices; a label is a string or a function read again on a language switch. */
    options: Array<{ value: string; label: string | (() => string) }>;
    /** The choice in force. */
    value?: string;
    /** The group's accessible name. */
    label?: () => string;
}

/** A row of choices, one pressed (`aria-pressed`). `null` when nothing would answer it. */
export function segmented(ctx: CardContext, { name, options, value, label }: SegmentedOptions): HTMLElement | null {
    if (!ctx.live || options.length === 0) return null;
    const group = el('div', { class: 'aparte-rich-card__segmented', attrs: { role: 'group' } });
    if (label) ctx.bind(group, label, 'aria-label');
    for (const option of options) {
        const pressed = option.value === value;
        const button = el('button', {
            class: 'aparte-rich-card__segment',
            attrs: { type: 'button', 'aria-pressed': pressed ? 'true' : 'false', 'data-card-key': `${name}:${option.value}` },
        });
        if (typeof option.label === 'function') ctx.bind(button, option.label);
        else button.textContent = option.label;
        button.addEventListener('click', () => {
            if (button.getAttribute('aria-pressed') === 'true') return;
            // Pressed at once, before the app answers: a second press reads what was chosen.
            for (const other of group.querySelectorAll('.aparte-rich-card__segment')) other.setAttribute('aria-pressed', other === button ? 'true' : 'false');
            ctx.change(name, option.value);
        });
        group.append(button);
    }
    return group;
}

export interface ToggleOptions {
    name: string;
    checked: boolean;
    /** What it switches ("Living-room light"). */
    label: () => string;
}

/** A switch (`role="switch"`). `null` when nothing would answer it. */
export function toggle(ctx: CardContext, { name, checked, label }: ToggleOptions): HTMLElement | null {
    if (!ctx.live) return null;
    const button = el('button', {
        class: 'aparte-rich-card__toggle',
        attrs: { type: 'button', role: 'switch', 'aria-checked': checked ? 'true' : 'false', 'data-card-key': name },
    }, el('span', { class: 'aparte-rich-card__toggle-thumb', attrs: { 'aria-hidden': 'true' } }));
    ctx.bind(button, label, 'aria-label');
    button.addEventListener('click', () => {
        // Flipped at once, before the app answers: a second click before the answer flips it
        // back, rather than sending the same state twice.
        const next = button.getAttribute('aria-checked') !== 'true';
        button.setAttribute('aria-checked', next ? 'true' : 'false');
        ctx.change(name, next);
    });
    return button;
}

export interface SliderOptions {
    name: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    label: () => string;
    /** How the value reads beside it, and to a screen reader ("60 %"). */
    format?: (value: number) => string;
}

/**
 * A slider: the value beside it follows while it moves, the change is reported once it is
 * let go (`change`, not `input`) — one request for a drag, not one per pixel.
 */
export function slider(ctx: CardContext, { name, value, min = 0, max = 100, step = 1, label, format = String }: SliderOptions): HTMLElement | null {
    if (!ctx.live) return null;
    const input = el('input', {
        class: 'aparte-rich-card__slider-input',
        attrs: { type: 'range', min, max, step, value, 'data-card-key': name },
    });
    const shown = el('output', { class: 'aparte-rich-card__slider-value' });
    const name_ = el('span', { class: 'aparte-rich-card__slider-label' });
    ctx.bind(name_, label);
    ctx.bind(input, label, 'aria-label');
    const paint = (v: number) => {
        shown.textContent = format(v);
        input.setAttribute('aria-valuetext', format(v));
    };
    ctx.bind(shown, () => format(Number(input.value)));
    paint(value);
    input.addEventListener('input', () => paint(Number(input.value)));
    input.addEventListener('change', () => ctx.change(name, Number(input.value)));
    return el('label', { class: 'aparte-rich-card__slider' }, name_, input, shown);
}
