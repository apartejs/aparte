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
    /**
     * Who decides whether a choice offers a free-text escape.
     *
     * It used to be a hardcoded `true` in the panel and a field in the schema the
     * MODEL fills — so the model decided the host's UX, and a small one filled it
     * without understanding it. It is now the host's policy, overridable per field by
     * an app calling `requestUserInput` directly.
     */
    describe('the free-text escape is the host\'s policy', () => {
        const plain: AparteElicitationSchema = { type: 'enum', options: [{ value: 'a' }] };
        const other = (panel: { el: HTMLElement }) => panel.el.querySelector('.aparte-elic-option--other');

        it('is offered by default', () => {
            expect(other(buildElicitationPanel('?', plain, noop))).not.toBeNull();
        });

        it('can be turned off for the whole surface', () => {
            const cfg = new AparteConfig();
            cfg.setElicitationOptions({ allowOther: false });
            expect(other(runWithConfig(cfg, () => buildElicitationPanel('?', plain, noop)))).toBeNull();
        });

        it('and a field that says so wins over the policy — that is the app talking', () => {
            const cfg = new AparteConfig();
            cfg.setElicitationOptions({ allowOther: false });
            const p = runWithConfig(cfg, () => buildElicitationPanel('?', { ...plain, allowOther: true }, noop));
            expect(other(p)).not.toBeNull();
        });
    });

    /**
     * A consumer can replace ONE field and keep the rest.
     *
     * Until this hook existed the surface was all-or-nothing: the built-in panel, or
     * `setElicitationPresenter` and you reimplemented placement, accept/decline/
     * cancel, send-button gating, focus and teardown. Every other customisation point
     * in this library is a hook; this one was missing.
     */
    /**
     * Several questions are asked ONE AT A TIME.
     *
     * Stacking them in one box came from MCP elicitation without being examined:
     * MCP describes a form for collecting structured data, which is not the same
     * thing as asking a person two questions in the middle of a conversation. No
     * product does the latter by stacking, and the shape they all use — one question
     * at a time, a chip per question — is what `header` exists for.
     *
     * The protocol is untouched: `isComplete()` still means every required field, so
     * the composer's send button still means submit and advancing is the panel's own
     * affordance.
     */
    describe('a form of several questions', () => {
        const twoQuestions: AparteElicitationSchema = {
            type: 'object',
            properties: {
                q1: { type: 'enum', title: 'Which colour?', header: 'Colour', options: [{ value: 'blue' }] },
                q2: { type: 'enum', title: 'Which shape?', header: 'Shape', options: [{ value: 'round' }] },
            },
        };
        const visible = (p: { el: HTMLElement }) =>
            Array.from(p.el.querySelectorAll<HTMLElement>('.aparte-elic-field')).filter((f) => !f.hidden);
        const chips = (p: { el: HTMLElement }) =>
            Array.from(p.el.querySelectorAll<HTMLButtonElement>('.aparte-elic-step'));

        it('shows one question, with a chip per question', () => {
            const p = buildElicitationPanel('', twoQuestions, noop);
            expect(visible(p), 'one question on screen, not two').toHaveLength(1);
            expect(visible(p)[0]!.textContent).toContain('Which colour?');
            expect(chips(p).map((c) => c.textContent)).toEqual(['Colour', 'Shape']);
        });

        it('falls back to the position when the model gave no short label', () => {
            const p = buildElicitationPanel('', {
                type: 'object',
                properties: { q1: { type: 'string', title: 'A?' }, q2: { type: 'string', title: 'B?' } },
            }, noop);
            // A number, not a truncated sentence: a chip cannot hold a question.
            expect(chips(p).map((c) => c.textContent)).toEqual(['1', '2']);
        });

        it('cannot advance past an unanswered question, and can once answered', () => {
            const p = buildElicitationPanel('', twoQuestions, noop);
            const next = p.el.querySelector<HTMLButtonElement>('.aparte-elic-next')!;
            expect(next.disabled, 'monotonic — the same rule the send button follows').toBe(true);

            select(p.el, 'blue');
            expect(next.disabled).toBe(false);

            next.click();
            expect(visible(p)[0]!.textContent).toContain('Which shape?');
        });

        it('is not submittable until every question is answered', () => {
            const p = buildElicitationPanel('', twoQuestions, noop);
            select(p.el, 'blue');
            expect(p.isComplete(), 'one of two answered').toBe(false);

            p.el.querySelector<HTMLButtonElement>('.aparte-elic-next')!.click();
            select(p.el, 'round');

            expect(p.isComplete()).toBe(true);
            expect(p.getContent()).toEqual({ q1: 'blue', q2: 'round' });
        });

        it('hides Next on the last question — the send button is the submit there', () => {
            const p = buildElicitationPanel('', twoQuestions, noop);
            const nav = p.el.querySelector<HTMLElement>('.aparte-elic-nav')!;
            expect(nav.hidden).toBe(false);

            select(p.el, 'blue');
            p.el.querySelector<HTMLButtonElement>('.aparte-elic-next')!.click();

            expect(nav.hidden, 'a second button that does nothing is worse than none').toBe(true);
        });

        it('a chip goes back to a question already answered', () => {
            const p = buildElicitationPanel('', twoQuestions, noop);
            select(p.el, 'blue');
            p.el.querySelector<HTMLButtonElement>('.aparte-elic-next')!.click();
            expect(visible(p)[0]!.textContent).toContain('Which shape?');

            chips(p)[0]!.click();

            expect(visible(p)[0]!.textContent, 'free navigation, not a hunt for a Back button').toContain('Which colour?');
            expect(chips(p)[0]!.getAttribute('aria-selected')).toBe('true');
            expect(chips(p)[0]!.hasAttribute('data-answered'), 'and it shows as answered').toBe(true);
        });

        it('a single question is never stepped', () => {
            const p = buildElicitationPanel('', {
                type: 'object',
                properties: { q1: { type: 'enum', title: 'Only one?', options: [{ value: 'a' }] } },
            }, noop);
            expect(chips(p), 'one question needs no chips').toHaveLength(0);
            expect(visible(p)).toHaveLength(1);
        });

        it('the host can ask for the form shape instead', () => {
            // MCP's case — collecting structured data in one go — is real. It is just
            // not what asking someone two questions looks like.
            const cfg = new AparteConfig();
            cfg.setElicitationOptions({ layout: 'stacked' });
            const p = runWithConfig(cfg, () => buildElicitationPanel('', twoQuestions, noop));

            expect(visible(p), 'both questions at once').toHaveLength(2);
            expect(chips(p)).toHaveLength(0);
        });
    });

    describe('a custom field renderer', () => {
        function chips(): AparteConfig {
            const cfg = new AparteConfig();
            cfg.setElicitationFieldRenderer((field, ctx) => {
                if (field.type !== 'enum') return null;   // the built-in keeps the rest
                const el = document.createElement('div');
                el.className = 'my-chips';
                let picked = '';
                for (const opt of field.options) {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.textContent = opt.label ?? opt.value;
                    b.addEventListener('click', () => { picked = opt.value; ctx.notifyChange(); });
                    el.appendChild(b);
                }
                return { el, getValue: () => picked, isComplete: () => picked !== '' };
            });
            return cfg;
        }

        it('renders instead of the built-in, and its value is the answer', () => {
            const cfg = chips();
            let changes = 0;
            const p = runWithConfig(cfg, () => buildElicitationPanel(
                '?',
                { type: 'enum', options: [{ value: 'a' }, { value: 'b' }] },
                () => { changes += 1; },
            ));

            expect(p.el.querySelector('.my-chips'), 'the custom field is placed').not.toBeNull();
            expect(p.el.querySelector('.aparte-elic-options'), 'and the built-in is not').toBeNull();
            expect(p.isComplete()).toBe(false);

            p.el.querySelectorAll('button')[1]!.click();

            expect(changes, 'notifyChange reaches the panel, which re-gates the send button').toBe(1);
            expect(p.isComplete()).toBe(true);
            expect(p.getContent()).toBe('b');
        });

        it('returning null falls back to the built-in for that kind', () => {
            const p = runWithConfig(chips(), () => buildElicitationPanel('?', { type: 'string' }, noop));
            expect(p.el.querySelector('.my-chips')).toBeNull();
            expect(p.el.querySelector('.aparte-elic-text'), 'the built-in text field').not.toBeNull();
        });

        it('is told which question it is answering in a form', () => {
            const seen: Array<string | undefined> = [];
            const cfg = new AparteConfig();
            cfg.setElicitationFieldRenderer((field, ctx) => {
                seen.push(ctx.key);
                void field;
                const el = document.createElement('div');
                return { el, getValue: () => '', isComplete: () => true };
            });

            runWithConfig(cfg, () => buildElicitationPanel('', {
                type: 'object',
                properties: { q1: { type: 'string' }, q2: { type: 'string' } },
            }, noop));

            expect(seen, 'the form key, so a renderer can vary per question').toEqual(['q1', 'q2']);
        });
    });

    /**
     * The schema vocabulary is CLOSED, and small on purpose: a custom presenter or
     * field renderer can `switch` over it exhaustively. Nothing said so, and nothing
     * stopped it growing quietly — this test is what makes adding a kind a decision
     * with a paper trail rather than a commit.
     */
    describe('the schema vocabulary', () => {
        it('is exactly three field kinds, plus the object form', () => {
            const kinds: AparteElicitationSchema[] = [
                { type: 'enum', options: [{ value: 'a' }] },
                { type: 'boolean' },
                { type: 'string' },
            ];
            for (const schema of kinds) {
                expect(buildElicitationPanel('?', schema, noop).el.querySelector('.aparte-elic-field')).not.toBeNull();
            }
            expect(kinds, 'adding a kind means updating the guides that promise exhaustiveness').toHaveLength(3);

            const form = buildElicitationPanel('', { type: 'object', properties: { a: { type: 'string' } } }, noop);
            expect(form.el.querySelector('.aparte-elic-field')).not.toBeNull();
        });
    });

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
