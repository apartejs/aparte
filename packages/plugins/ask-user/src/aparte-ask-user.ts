/**
 * <aparte-ask-user> — a semantic alias of core's <aparte-elicitation>.
 *
 * ask_user runs on the core elicitation primitive; it has no bespoke Web
 * Component. This thin subclass lets you mount the presenter with intent-revealing
 * markup (`<aparte-ask-user>`) instead of the generic `<aparte-elicitation>`.
 * The two are interchangeable.
 */

import { AparteElicitation } from '@aparte/core';

/**
 * A semantic alias of core's `<aparte-elicitation>`: same presenter, intent-revealing
 * tag. `ask_user` runs on the core elicitation primitive and has no bespoke component,
 * so this subclass adds no behaviour — it exists so markup can say what it means. The
 * two are interchangeable, and neither dispatches anything.
 *
 * @element aparte-ask-user
 *
 * @example
 * <!-- Identical to <aparte-elicitation>; mount either one, never both. -->
 * <aparte-chat>
 *   <aparte-chat-viewport></aparte-chat-viewport>
 *   <aparte-ask-user></aparte-ask-user>
 *   <aparte-composer></aparte-composer>
 * </aparte-chat>
 */
export class AparteAskUser extends AparteElicitation {}

if (typeof customElements !== 'undefined' && !customElements.get('aparte-ask-user')) {
    customElements.define('aparte-ask-user', AparteAskUser);
}

declare global {
    interface HTMLElementTagNameMap {
        'aparte-ask-user': AparteAskUser;
    }
}
