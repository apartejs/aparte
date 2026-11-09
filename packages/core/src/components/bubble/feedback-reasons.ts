/**
 * The row a thumbs-down opens, when the app listed reasons (`setBubbleActions({ feedbackReasons })`):
 * one press says why, and the row goes. Not saying is a press too.
 */
export interface FeedbackReasonsOptions {
    reasons: readonly string[];
    title: string;
    dismiss: string;
    onPick: (reason: string) => void;
    onClose: () => void;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `aparte-btn aparte-btn--sm ${className}`;
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
}

export function buildFeedbackReasons(options: FeedbackReasonsOptions): HTMLElement {
    const root = document.createElement('div');
    root.className = 'aparte-feedback-reasons';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', options.title);
    const title = document.createElement('span');
    title.textContent = options.title;
    root.appendChild(title);
    for (const reason of options.reasons) {
        root.appendChild(button(reason, 'aparte-btn--surface', () => options.onPick(reason)));
    }
    root.appendChild(button(options.dismiss, 'aparte-btn--ghost', options.onClose));
    return root;
}
