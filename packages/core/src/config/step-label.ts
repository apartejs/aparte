/**
 * How a step is called on screen: the words shown for the name a run announced.
 *
 * A server that streams `step-start { name }` sends a stable key (`slot-wait`, `restore`,
 * `reread`), and the page knows the person's language. The app maps one to the other with
 * {@link AparteConfig.registerStepLabel}; core never makes a label up.
 */
import type { AparteLocale } from './locale.js';

/** What a step label function is told when the page asks for its words. */
export interface AparteStepLabelContext {
    /** The step's name, as the run announced it: the key the label stands for. */
    name: string;
    /** The config's locale as it is now. The function is asked again when the locale changes. */
    locale: AparteLocale;
}

/**
 * The words shown for a step: plain text, never HTML — or a function of the locale, asked at
 * every draw, so a language switch changes what a step that is open says. A label that says
 * nothing, or a function that throws, leaves the name itself.
 */
export type AparteStepLabel = string | ((context: AparteStepLabelContext) => string);
