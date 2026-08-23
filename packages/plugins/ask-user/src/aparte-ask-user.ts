/**
 * <aparte-ask-user> — a semantic alias of core's <aparte-elicitation>.
 *
 * ask_user runs on the core elicitation primitive; it has no bespoke Web
 * Component. This thin subclass lets you mount the presenter with intent-revealing
 * markup (`<aparte-ask-user>`) instead of the generic `<aparte-elicitation>`.
 * The two are interchangeable.
 */

import { AparteElicitation } from '@aparte/core';

/** Subclass alias of {@link AparteElicitation}. */
export class AparteAskUser extends AparteElicitation {}

if (typeof customElements !== 'undefined' && !customElements.get('aparte-ask-user')) {
    customElements.define('aparte-ask-user', AparteAskUser);
}

declare global {
    interface HTMLElementTagNameMap {
        'aparte-ask-user': AparteAskUser;
    }
}
