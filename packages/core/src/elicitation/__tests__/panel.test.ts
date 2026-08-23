import { describe, it, expect } from 'vitest';
import { buildElicitationPanel } from '../panel';
import { aparteGlobalConfig, runWithConfig, AparteConfig } from '../../config/index.js';
import type { AparteElicitationSchema } from '../types';

const noop = () => {};

function select(panel: HTMLElement, value: string): void {
    const input = panel.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('buildElicitationPanel', () => {
    it('renders the message', () => {
        const p = buildElicitationPanel('Pick one', { type: 'enum', options: [{ value: 'a' }] }, noop);
        expect(p.el.querySelector('.aparte-elic-message')!.textContent).toBe('Pick one');
    });

    /**
     * The panel's own words are the user's words.
     *
     * "Other…", its placeholder, its accessible name and "Skip" were hardcoded
     * English, so a French model's questions arrived under English chrome — visible
     * the first time anyone ran this with a non-English locale. The keys are
     * OPTIONAL and `t()` falls back to `APARTE_DEFAULT_LOCALE` per key, so an
     * existing locale package keeps compiling and keeps working.
     */
    /**
     * A group of choices has to be NAMED by the question it answers.
     *
     * Nothing tied the `<p>` holding the question to the list of radios below it, so
     * a screen reader announced "Chromium, radio button, 1 of 2" with no question
     * attached — and in the multi-question form, several such lists in a row with no
     * way to tell which was which. `role="radiogroup"` + `aria-labelledby` rather
     * than `<fieldset><legend>`: same semantics, and it changes no layout.
     */
    describe('accessible grouping', () => {
        it('names a single question group from the panel message', () => {
            const p = buildElicitationPanel('Which engine?', { type: 'enum', options: [{ value: 'a' }] }, noop);
            const list = p.el.querySelector('.aparte-elic-options')!;
            expect(list.getAttribute('role')).toBe('radiogroup');
            // No field title in this shape — the message IS the question.
            expect(list.getAttribute('aria-label')).toBe('Which engine?');
        });

        it('names each question of a form from its own title', () => {
            const p = buildElicitationPanel('', {
                type: 'object',
                properties: {
                    q1: { type: 'enum', title: 'Colour?', options: [{ value: 'blue' }] },
                    q2: { type: 'enum', title: 'Shape?', options: [{ value: 'round' }] },
                },
            }, noop);

            const lists = Array.from(p.el.querySelectorAll('.aparte-elic-options'));
            expect(lists).toHaveLength(2);
            const names = lists.map((list) => {
                const id = list.getAttribute('aria-labelledby');
                return id ? p.el.querySelector(`#${id}`)?.textContent : null;
            });
            expect(names, 'each group points at its own question').toEqual(['Colour?', 'Shape?']);
        });

        it('a multi-select is a group, not a radiogroup', () => {
            const p = buildElicitationPanel('?', { type: 'enum', multiple: true, options: [{ value: 'a' }] }, noop);
            expect(p.el.querySelector('.aparte-elic-options')!.getAttribute('role')).toBe('group');
        });

        it('a yes/no question is a named radiogroup too', () => {
            const p = buildElicitationPanel('Proceed?', { type: 'boolean' }, noop);
            const list = p.el.querySelector('.aparte-elic-options')!;
            expect(list.getAttribute('role')).toBe('radiogroup');
            expect(list.getAttribute('aria-label')).toBe('Proceed?');
        });

        it('a free-text field takes its accessible name from the question', () => {
            const p = buildElicitationPanel('Your name?', { type: 'string' }, noop);
            expect(p.el.querySelector('.aparte-elic-text')!.getAttribute('aria-label')).toBe('Your name?');
        });
    });

    describe('localisation', () => {
        const withOther: AparteElicitationSchema = { type: 'enum', options: [{ value: 'a' }], allowOther: true };

        it('takes the free-text option and its placeholder from the locale', () => {
            const cfg = new AparteConfig();
            cfg.setLocale({ ...aparteGlobalConfig.getLocale(), elicitationOther: 'Autre…', elicitationOtherPlaceholder: 'Votre réponse…' });

            const p = runWithConfig(cfg, () => buildElicitationPanel('?', withOther, noop));

            expect(p.el.querySelector('.aparte-elic-option--other .aparte-elic-option-title')!.textContent).toBe('Autre…');
            expect(p.el.querySelector<HTMLInputElement>('.aparte-elic-other-input')!.placeholder).toBe('Votre réponse…');
        });

        it('falls back to English for a locale that predates these keys', () => {
            const cfg = new AparteConfig();
            // A locale package built before the keys existed: every other key set,
            // these four absent. `t()` must reach the default, not print the key.
            cfg.setLocale({ ...aparteGlobalConfig.getLocale(), elicitationOther: undefined });

            const p = runWithConfig(cfg, () => buildElicitationPanel('?', withOther, noop));

            const label = p.el.querySelector('.aparte-elic-option--other .aparte-elic-option-title')!.textContent;
            expect(label).toBe('Other…');
            expect(label, 'never the raw key').not.toBe('elicitationOther');
        });
    });

    describe('enum', () => {
        const schema: AparteElicitationSchema = {
            type: 'enum',
            options: [{ value: 'react', label: 'React' }, { value: 'vue', label: 'Vue' }],
            allowOther: false,
        };
        it('is incomplete until a choice is made, then returns the value', () => {
            const p = buildElicitationPanel('?', schema, noop);
            expect(p.isComplete()).toBe(false);
            select(p.el, 'vue');
            expect(p.isComplete()).toBe(true);
            expect(p.getContent()).toBe('vue');
        });

        it('multiple returns an array of checked values', () => {
            const p = buildElicitationPanel('?', { ...schema, multiple: true } as AparteElicitationSchema, noop);
            select(p.el, 'react');
            select(p.el, 'vue');
            expect(p.getContent()).toEqual(['react', 'vue']);
        });

        it('honours the free-text "Other…" option', () => {
            const p = buildElicitationPanel('?', { type: 'enum', options: [{ value: 'a' }], allowOther: true }, noop);
            select(p.el, '__other__');
            const other = p.el.querySelector<HTMLInputElement>('.aparte-elic-other-input')!;
            other.value = 'svelte';
            other.dispatchEvent(new Event('input', { bubbles: true }));
            expect(p.getContent()).toBe('svelte');
            expect(p.isComplete()).toBe(true);
        });

        it('pre-selects the default', () => {
            const p = buildElicitationPanel('?', { ...schema, default: 'vue' } as AparteElicitationSchema, noop);
            expect(p.getContent()).toBe('vue');
        });
    });

    describe('boolean', () => {
        it('returns true/false and gates on selection', () => {
            const p = buildElicitationPanel('OK?', { type: 'boolean' }, noop);
            expect(p.isComplete()).toBe(false);
            select(p.el, 'true');
            expect(p.getContent()).toBe(true);
            select(p.el, 'false');
            expect(p.getContent()).toBe(false);
            expect(p.isComplete()).toBe(true);
        });

        it('uses custom labels', () => {
            const p = buildElicitationPanel('?', { type: 'boolean', trueLabel: 'Approve', falseLabel: 'Reject' }, noop);
            expect(p.el.textContent).toContain('Approve');
            expect(p.el.textContent).toContain('Reject');
        });
    });

    describe('string', () => {
        it('is incomplete while empty (required) and returns the text', () => {
            const p = buildElicitationPanel('Name?', { type: 'string' }, noop);
            expect(p.isComplete()).toBe(false);
            const input = p.el.querySelector<HTMLInputElement>('.aparte-elic-text')!;
            input.value = 'Paul';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            expect(p.isComplete()).toBe(true);
            expect(p.getContent()).toBe('Paul');
        });

        it('optional string is complete when empty', () => {
            const p = buildElicitationPanel('?', { type: 'string', required: false }, noop);
            expect(p.isComplete()).toBe(true);
        });

        it('renders a textarea when multiline', () => {
            const p = buildElicitationPanel('?', { type: 'string', multiline: true }, noop);
            expect(p.el.querySelector('textarea.aparte-elic-text')).not.toBeNull();
        });
    });

    describe('object (form)', () => {
        const schema: AparteElicitationSchema = {
            type: 'object',
            properties: {
                framework: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }] },
                notes: { type: 'string', required: false },
            },
            required: ['framework'],
        };
        it('returns a record and requires only the required fields', () => {
            const p = buildElicitationPanel('Setup', schema, noop);
            expect(p.isComplete()).toBe(false); // framework not chosen
            select(p.el, 'react');
            expect(p.isComplete()).toBe(true);  // notes optional
            expect(p.getContent()).toEqual({ framework: 'react', notes: '' });
        });

        it('labels each field (falls back to the key)', () => {
            const p = buildElicitationPanel('Setup', schema, noop);
            const titles = [...p.el.querySelectorAll('.aparte-elic-title')].map(t => t.textContent);
            expect(titles).toContain('framework');
            expect(titles).toContain('notes');
        });
    });

    it('fires onChange on input so the presenter can gate submit', () => {
        let changes = 0;
        const p = buildElicitationPanel('?', { type: 'enum', options: [{ value: 'a' }], allowOther: false }, () => { changes++; });
        select(p.el, 'a');
        expect(changes).toBeGreaterThan(0);
    });
});
