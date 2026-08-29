// @vitest-environment jsdom
/**
 * An approval is a DECISION, and the panel that asks for one is not the panel that
 * collects a value.
 *
 * The two things it must get right, and the two the question panel gets right by being
 * different: an option settles on the FIRST click (approving is the most frequent
 * interaction in the feature, and spending two gestures on it to reuse the composer's
 * send button would be the tail wagging the dog), and the options come with the request
 * — core cannot write "and always for git commands", only the host that can honour it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { buildApprovalPanel } from '../approval-panel.js';
import { aparteGlobalConfig } from '../../config/aparte-config.js';
import type { AparteApprovalAnswer } from '../types.js';

const OPTIONS = [
    { value: 'allow', label: 'Approve', tone: 'affirm' as const },
    { value: 'allow', label: 'Approve, and always for this tool', tone: 'affirm' as const },
    { value: 'deny', label: 'Reject', tone: 'deny' as const },
];

const NOOP = (): void => { /* the panel's onChange, unused here */ };

afterEach(() => { aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

describe('buildApprovalPanel', () => {
    it('renders exactly the options it was given, in order', () => {
        const panel = buildApprovalPanel('Run delete_file?', OPTIONS, NOOP);
        const labels = [...panel.el.querySelectorAll('.aparte-approval-option')].map(b => b.textContent);
        expect(labels).toEqual(['Approve', 'Approve, and always for this tool', 'Reject']);
    });

    it('draws an option\'s description under its label, so two "always" scopes differ on screen (#37)', () => {
        const panel = buildApprovalPanel('Run run_shell?', [
            { value: 'allow', label: 'Always allow this command', description: 'git status' },
            { value: 'allow', label: 'Always allow any git command', description: 'git *' },
            { value: 'deny', label: 'Refuse', tone: 'deny' },
        ], NOOP);
        const buttons = [...panel.el.querySelectorAll<HTMLButtonElement>('.aparte-approval-option')];

        expect(buttons[0]!.querySelector('.aparte-elic-option-title')?.textContent).toBe('Always allow this command');
        expect(buttons[0]!.querySelector('.aparte-elic-option-desc')?.textContent).toBe('git status');
        expect(buttons[1]!.querySelector('.aparte-elic-option-desc')?.textContent).toBe('git *');
        // The accessible name carries the scope too: a screen reader hears the reach.
        expect(buttons[1]!.textContent).toContain('git *');
        expect(buttons[2]!.querySelector('.aparte-elic-option-desc'), 'no description, no empty line').toBeNull();
    });

    it('re-reads a function description on relabel, in place, without losing focus', () => {
        let lang = 'en';
        const panel = buildApprovalPanel('?', [
            { value: 'allow', label: () => (lang === 'fr' ? 'Toujours' : 'Always'), description: () => (lang === 'fr' ? 'toutes les commandes git' : 'any git command') },
        ], NOOP);
        document.body.appendChild(panel.el);
        const button = panel.el.querySelector<HTMLButtonElement>('.aparte-approval-option')!;
        button.focus();

        lang = 'fr';
        panel.relabel();

        expect(button.querySelector('.aparte-elic-option-title')?.textContent).toBe('Toujours');
        expect(button.querySelector('.aparte-elic-option-desc')?.textContent).toBe('toutes les commandes git');
        expect(document.activeElement).toBe(button);
    });

    it('offers no options when the request carried none', () => {
        // Not a crash and not a default pair: a gate that declares nothing has nothing
        // core can honour, and inventing Approve/Reject here would be core deciding what
        // the host meant.
        const panel = buildApprovalPanel('?', [], NOOP);
        expect(panel.el.querySelectorAll('.aparte-approval-option')).toHaveLength(0);
    });

    it('settles on the first click, with the option that was clicked', () => {
        const panel = buildApprovalPanel('Run delete_file?', OPTIONS, NOOP);
        const seen: AparteApprovalAnswer[] = [];
        panel.onSettle((a) => seen.push(a));

        panel.el.querySelectorAll<HTMLButtonElement>('.aparte-approval-option')[2]!.click();

        expect(seen).toEqual([{ option: 'deny' }]);
    });

    it('settles once, whatever else is clicked afterwards', () => {
        // The panel is torn down by the presenter on settle, but a second click can land
        // in the same tick — and a decision answered twice is a decision the loop cannot
        // trust.
        const panel = buildApprovalPanel('Run delete_file?', OPTIONS, NOOP);
        const seen: AparteApprovalAnswer[] = [];
        panel.onSettle((a) => seen.push(a));

        const buttons = panel.el.querySelectorAll<HTMLButtonElement>('.aparte-approval-option');
        buttons[0]!.click();
        buttons[2]!.click();

        expect(seen).toHaveLength(1);
        expect(seen[0]).toEqual({ option: 'allow' });
    });

    it('tells the two tones apart, so a refusal does not look like an approval', () => {
        const panel = buildApprovalPanel('?', OPTIONS, NOOP);
        const [first, , third] = [...panel.el.querySelectorAll('.aparte-approval-option')];
        expect(first!.className).toContain('aparte-approval-option--affirm');
        expect(third!.className).toContain('aparte-approval-option--deny');
    });

    it('is incomplete until something is typed, and then carries those words', () => {
        // The composer's send button reads `isComplete()`, and the instruction is what it
        // submits. Empty and whitespace are the same thing: a refusal whose reason is
        // three spaces tells the model nothing.
        const panel = buildApprovalPanel('?', OPTIONS, NOOP);
        const field = panel.el.querySelector<HTMLTextAreaElement>('.aparte-approval-instruction')!;

        expect(panel.isComplete()).toBe(false);
        field.value = '   ';
        expect(panel.isComplete(), 'whitespace is not an instruction').toBe(false);

        field.value = '  use --dry-run first  ';
        expect(panel.isComplete()).toBe(true);
        expect(panel.getContent()).toEqual({ instruction: 'use --dry-run first' });
    });

    it('focuses the first option, not the text box', () => {
        const panel = buildApprovalPanel('?', OPTIONS, NOOP);
        document.body.appendChild(panel.el);
        panel.focus();
        // Landing in a text box invites typing an answer to a yes/no question.
        expect(document.activeElement?.textContent).toBe('Approve');
    });

    it('relabels its own strings in place', () => {
        const panel = buildApprovalPanel('?', OPTIONS, NOOP);
        const field = panel.el.querySelector<HTMLTextAreaElement>('.aparte-approval-instruction')!;
        const before = field.placeholder;

        aparteGlobalConfig.setLocale({
            ...aparteGlobalConfig.getLocale(),
            approvalInstructionPlaceholder: 'Ou dites-lui quoi faire',
        });
        panel.relabel();

        expect(field.placeholder).not.toBe(before);
        expect(field.placeholder).toBe('Ou dites-lui quoi faire');
        // In place, per the relabel contract: no node added or removed, so a caret in
        // this field survives a language switch.
        expect(panel.el.querySelector('.aparte-approval-instruction')).toBe(field);
    });
});

/**
 * The panel shows the CALL, not only its name.
 *
 * "Run delete_file?" over Approve/Reject asks for a signature on a blank page: which
 * file, which path, which amount is the whole of what a person is deciding, and it
 * lived only in the transcript row, behind a disclosure that stays closed on purpose.
 *
 * `details` is model-authored text on the one control whose job is to stop a model, so
 * the escaping half is not decoration: a string arm here would be a model-to-DOM XSS
 * with the user's own click as the trigger.
 */
describe('buildApprovalPanel — the arguments under the question', () => {
    const JSON_ARGS = '{\n  "path": "a.ts"\n}';

    it('renders them, in order, between the question and the options', () => {
        const panel = buildApprovalPanel('Run delete_file?', OPTIONS, NOOP, JSON_ARGS);
        const pre = panel.el.querySelector('.aparte-approval-args');
        expect(pre?.textContent).toBe(JSON_ARGS);
        const order = [...panel.el.children].map((c) => c.className.split(' ')[0]);
        expect(order.indexOf('aparte-elic-message')).toBeLessThan(order.indexOf('aparte-approval-args'));
        expect(order.indexOf('aparte-approval-args')).toBeLessThan(order.indexOf('aparte-approval-options'));
    });

    it('renders nothing at all when there are no arguments', () => {
        // Decision #8: a region that reveals nothing is an affordance that lies. A tool
        // with no input gets the panel it had.
        const panel = buildApprovalPanel('Run list_files?', OPTIONS, NOOP);
        expect(panel.el.querySelector('.aparte-approval-args')).toBeNull();
        expect(panel.el.querySelector('.aparte-approval-args-label')).toBeNull();
    });

    it('is TEXT: markup in an argument is shown, never parsed', () => {
        const payload = '{"note": "<img src=x onerror=alert(1)><script>alert(2)</script>"}';
        const panel = buildApprovalPanel('Run write_note?', OPTIONS, NOOP, payload);
        const pre = panel.el.querySelector('.aparte-approval-args')!;
        expect(pre.textContent).toBe(payload);
        expect(pre.querySelector('img')).toBeNull();
        expect(pre.querySelector('script')).toBeNull();
        expect(panel.el.querySelectorAll('img,script').length).toBe(0);
    });

    it('is named, and the name follows a language switch', () => {
        const panel = buildApprovalPanel('Run delete_file?', OPTIONS, NOOP, JSON_ARGS);
        const label = panel.el.querySelector<HTMLElement>('.aparte-approval-args-label')!;
        const pre = panel.el.querySelector<HTMLElement>('.aparte-approval-args')!;
        expect(label.textContent).toBe('Arguments');
        // The heading names the region, rather than reading as part of the question.
        expect(pre.getAttribute('aria-labelledby')).toBe(label.id);
        expect(label.id).not.toBe('');

        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), approvalArgsLabel: 'Paramètres' });
        panel.relabel();
        expect(label.textContent).toBe('Paramètres');
    });

    it('can be scrolled from the keyboard, since it is a capped scroll box', () => {
        // The transcript's own defect, on a smaller surface: WebKit gives an
        // unfocusable overflow box no keyboard scroll at all.
        const panel = buildApprovalPanel('Run apply_patch?', OPTIONS, NOOP, JSON_ARGS);
        expect(panel.el.querySelector<HTMLElement>('.aparte-approval-args')!.tabIndex).toBe(0);
    });

    it('gives two panels on one page two different heading ids', () => {
        const a = buildApprovalPanel('?', OPTIONS, NOOP, JSON_ARGS);
        const b = buildApprovalPanel('?', OPTIONS, NOOP, JSON_ARGS);
        const idOf = (p: { el: HTMLElement }) => p.el.querySelector('.aparte-approval-args-label')!.id;
        expect(idOf(a)).not.toBe(idOf(b));
    });
});
