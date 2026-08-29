/**
 * buildApprovalPanel — the panel for a decision, as opposed to a value.
 *
 * A sibling of `buildElicitationPanel` rather than three more parameters on it, and
 * the split follows the contracts: that function's is "a schema in, a value out", and
 * an approval has no schema and returns no value. What they share is the composer
 * slot, which is the presenter's business, not the builder's.
 *
 * Two shapes it does NOT reuse, each for a reason:
 *
 *  - Not radios plus the composer's send button. A question is one act with one
 *    primary button, which is why the elicitation panel has no action row of its own.
 *    A decision has two primary actions of OPPOSITE polarity, and one button cannot
 *    carry both — so the options are buttons that settle on the first click.
 *    Approving is the most frequent interaction in the whole feature; spending two
 *    gestures on it to reuse a button would be the tail wagging the dog.
 *  - Not a fixed Approve/Reject pair. The options arrive WITH the request, because
 *    only the requester can write "and always for git commands" or know that this
 *    workspace has somewhere to remember it.
 *
 * The composer's button is not idle: opening the instruction field hands it the
 * `'submit'` mode for that text, through the `setPanelSubmitEnabled` API that already
 * exists for the last question of a form.
 */

import type { AparteApprovalOption, AparteApprovalAnswer } from './types.js';
import { contextConfig } from '../config/config-context.js';
import { optionBody } from './panel.js';

/** What the presenter drives. A superset of the question panel's useful half. */
export interface BuiltApprovalPanel {
    readonly el: HTMLElement;
    /** The corner escape — see `BuiltElicitationPanel.dismiss` for why a corner. */
    readonly dismiss: HTMLElement;
    /** Settled from inside the panel: an option was clicked. */
    onSettle(cb: (answer: AparteApprovalAnswer) => void): void;
    /** The instruction typed so far, for the composer's submit path. */
    getContent(): AparteApprovalAnswer;
    /** True once there is an instruction worth sending. */
    isComplete(): boolean;
    focus(): void;
    /** Re-apply every string taken from the locale, in place. */
    relabel(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

export function buildApprovalPanel(
    message: string | (() => string),
    options: readonly AparteApprovalOption[],
    onChange: () => void,
): BuiltApprovalPanel {
    const cfg = contextConfig();
    const panel = el('div', 'aparte-elic-panel aparte-approval-panel');

    const askText = (): string => (typeof message === 'function' ? message() : message);
    // `textContent`, never innerHTML: the message names a tool the MODEL chose and can
    // carry its arguments. The string arm of a render hook is a model-to-DOM XSS.
    const ask = askText() ? el('p', 'aparte-elic-message', askText()) : null;
    if (ask) panel.appendChild(ask);

    const dismiss = el('div', 'aparte-elic-dismiss');
    panel.appendChild(dismiss);

    let settle: ((answer: AparteApprovalAnswer) => void) | null = null;
    let done = false;
    const fire = (answer: AparteApprovalAnswer): void => {
        if (done) return;
        done = true;
        settle?.(answer);
    };

    // ── the options ──────────────────────────────────────────────────────────
    const row = el('div', 'aparte-approval-options');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', cfg.t('approvalOptionsLabel'));
    /** Kept so `relabel` can reach each button and the label that owns it. */
    const labelled: Array<{ button: HTMLButtonElement; option: AparteApprovalOption }> = [];
    const textOf = (option: AparteApprovalOption): string =>
        typeof option.label === 'function' ? option.label() : option.label;
    const descriptionOf = (option: AparteApprovalOption): string | undefined =>
        typeof option.description === 'function' ? option.description() : option.description;
    /**
     * Label over description, the question panel's own body — so "Always allow this
     * command" can say `git status` under it and "Always allow any git command" can
     * say `git *`, which is the whole difference between the two (issue #37).
     */
    const bodyOf = (option: AparteApprovalOption): HTMLElement => optionBody(textOf(option), descriptionOf(option));
    /*
     * The button recipe, and nothing else. An option used to carry a 2px coloured edge
     * down its inline start — green for affirm, red for deny — and that was custom CSS
     * doing a job the recipe already does: a coloured rule is an ALERT's vocabulary, not
     * a control's, and at 2px it read as an artefact rather than as a signal.
     *
     * Colouring the fills instead was measured and is no better. Solid success on the
     * dark palette gives 2.19:1 against its own label, which is unreadable, and tinting
     * every option puts two greens beside one red — the traffic light this stacked list
     * exists to avoid, on the highest-stakes control in the library. What separates the
     * options is their WORDING, which is the only thing that can distinguish "Approve"
     * from "Approve, and always for this tool" anyway.
     *
     * `--affirm` / `--deny` stay on the element and carry no CSS: they name the MEANING,
     * which is what a consumer restyling this panel selects on.
     */
    for (const option of options) {
        const tone = option.tone ?? 'affirm';
        const button = el('button', `aparte-btn aparte-btn--block aparte-btn--surface aparte-approval-option aparte-approval-option--${tone}`);
        button.type = 'button';
        button.appendChild(bodyOf(option));
        // First click settles. No confirm-then-submit: the decision IS the click.
        button.addEventListener('click', () => fire({ option: option.value }));
        row.appendChild(button);
        labelled.push({ button, option });
    }
    panel.appendChild(row);

    // ── "or tell it what to do instead" ──────────────────────────────────────
    /*
     * A refusal that carries an instruction, which is possible at all only because a
     * refusal now hands the model a turn to read it in. Before that the sentence went
     * into a history nobody sent, so the user had to retype it as a message the model
     * then read out of order.
     *
     * It is a field and not an option because the host writes its options and this
     * text is the user's. It resolves through the COMPOSER's button rather than one of
     * its own — submitting written text is exactly the act that button already means.
     */
    const instruction = el('textarea', 'aparte-approval-instruction');
    instruction.rows = 1;
    instruction.placeholder = cfg.t('approvalInstructionPlaceholder');
    instruction.setAttribute('aria-label', cfg.t('approvalInstructionPlaceholder'));
    instruction.addEventListener('input', onChange);
    panel.appendChild(instruction);

    const typed = (): string => instruction.value.trim();

    return {
        el: panel,
        dismiss,
        onSettle: (cb) => { settle = cb; },
        getContent: () => ({ instruction: typed() }),
        isComplete: () => typed().length > 0,
        focus: () => {
            // The first option, not the textarea: the common case is a decision, and
            // landing in a text box invites typing an answer to a yes/no question.
            panel.querySelector<HTMLButtonElement>('.aparte-approval-option')?.focus();
        },
        relabel: () => {
            const now = contextConfig();
            const label = now.t('approvalInstructionPlaceholder');
            instruction.placeholder = label;
            instruction.setAttribute('aria-label', label);
            row.setAttribute('aria-label', now.t('approvalOptionsLabel'));
            // The question, which was the half I left behind the first time.
            if (ask) ask.textContent = askText();
            // In place, per the relabel contract: the buttons keep their listeners and —
            // the part that matters — their FOCUS. This is the one control a keyboard
            // user may be sitting on when the language changes. The body is replaced,
            // the button is not.
            for (const { button, option } of labelled) button.replaceChildren(bodyOf(option));
        },
    };
}
