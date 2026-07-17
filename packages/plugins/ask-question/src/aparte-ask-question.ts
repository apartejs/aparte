/**
 * <aparte-ask-question> — a semantic alias of core's <aparte-elicitation>.
 *
 * ask_question runs on the core elicitation primitive; it has no bespoke Web
 * Component. This thin subclass lets you mount the presenter with intent-revealing
 * markup (`<aparte-ask-question>`) instead of the generic `<aparte-elicitation>`.
 * The two are interchangeable.
 */

import { AparteElicitation } from '@aparte/core';

/** Subclass alias of {@link AparteElicitation}. */
export class AparteAskQuestion extends AparteElicitation {}

if (typeof customElements !== 'undefined' && !customElements.get('aparte-ask-question')) {
    customElements.define('aparte-ask-question', AparteAskQuestion);
}

declare global {
    interface HTMLElementTagNameMap {
        'aparte-ask-question': AparteAskQuestion;
    }
}
