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
