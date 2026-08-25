/**
 * Elicitation — the generic "pause the run and ask the user for typed input"
 * primitive. Generalises the bespoke `ask_user` tool: the KIND of question
 * is carried by a flat schema, not by a dedicated tool. Shape is aligned with
 * MCP elicitation (message + requested schema, accept/decline/cancel), but the
 * mechanism is transport-agnostic and framework-agnostic — a typed presenter
 * registered per config instance, never window events.
 */

/** A single choice field: radios (default) or checkboxes (`multiple`). */
export interface AparteElicitationEnumField {
    type: 'enum';
    title?: string;
    /**
     * A SHORT label for this question — two or three words, no sentence.
     *
     * A multi-question form is presented one question at a time, with a chip per
     * question, and a chip cannot hold a sentence. `title` is the question as the
     * user reads it; `header` is how it is referred to. Omitted, the chip falls back
     * to the question's position, which is honest and never truncates badly.
     */
    header?: string;
    description?: string;
    options: Array<{ value: string; label?: string; description?: string; recommended?: boolean }>;
    /** Checkboxes (multi-select) instead of radios. */
    multiple?: boolean;
    /** Offer a free-text "Other…" fallback. Default true. */
    allowOther?: boolean;
    /** Pre-selected value (or values, when `multiple`). */
    default?: string | string[];
}

/** A yes/no field, rendered as two choices. */
export interface AparteElicitationBooleanField {
    type: 'boolean';
    title?: string;
    /**
     * A SHORT label for this question — two or three words, no sentence.
     *
     * A multi-question form is presented one question at a time, with a chip per
     * question, and a chip cannot hold a sentence. `title` is the question as the
     * user reads it; `header` is how it is referred to. Omitted, the chip falls back
     * to the question's position, which is honest and never truncates badly.
     */
    header?: string;
    description?: string;
    default?: boolean;
    /** Labels for the two choices (fall back to the locale yes/no). */
    trueLabel?: string;
    falseLabel?: string;
}

/** A free-text field. */
export interface AparteElicitationStringField {
    type: 'string';
    title?: string;
    /**
     * A SHORT label for this question — two or three words, no sentence.
     *
     * A multi-question form is presented one question at a time, with a chip per
     * question, and a chip cannot hold a sentence. `title` is the question as the
     * user reads it; `header` is how it is referred to. Omitted, the chip falls back
     * to the question's position, which is honest and never truncates badly.
     */
    header?: string;
    description?: string;
    placeholder?: string;
    default?: string;
    /** Render a multi-line textarea. */
    multiline?: boolean;
    /** Required to accept. Default true. */
    required?: boolean;
    minLength?: number;
    maxLength?: number;
}

/** A single input field. */
export type AparteElicitationField =
    | AparteElicitationEnumField
    | AparteElicitationBooleanField
    | AparteElicitationStringField;

/** A multi-field form: one labelled field per property. */
export interface AparteElicitationObjectSchema {
    type: 'object';
    properties: Record<string, AparteElicitationField>;
    /** Which keys must be filled to accept. Default: all of them. */
    required?: string[];
}

/** The schema for a request: a single field, or an object (form) of fields. */
export type AparteElicitationSchema = AparteElicitationField | AparteElicitationObjectSchema;

export interface AparteElicitationRequest {
    /** Human-readable prompt shown above the input(s). */
    message: string;
    /** What to ask for. */
    schema: AparteElicitationSchema;
    /**
     * An element inside the target chat, used to resolve WHICH instance presents
     * the request (its config + composer). Omit for the global/default chat.
     */
    target?: HTMLElement | null;
    /**
     * Aborts the request — the panel closes and the promise REJECTS with
     * {@link AparteElicitationAbortError}. Pass a tool handler's signal so a
     * client-side timeout or a stopped turn tears the panel down instead of leaving
     * it open.
     */
    signal?: AbortSignal;
}

/**
 * The user's response. `content` matches the schema:
 * enum→string, enum+multiple→string[], boolean→boolean, string→string,
 * object→Record<key, value>.
 */
export type AparteElicitationResult =
    | { action: 'accept'; content: unknown }
    | { action: 'decline' };

/**
 * The request ended without an answer: the turn was stopped, the signal fired, the
 * question was taken away by another request, or nothing was mounted to ask it.
 *
 * A THROW, and not a third member of {@link AparteElicitationResult}. `cancel` was a
 * VALUE, so it was easy to handle as though it were an answer — and that is exactly
 * what happened: the approval gate treated it as a refusal, stamped the segment
 * `rejected`, and told the model "Tool execution was rejected by the user." The user
 * had pressed Stop. A rejection cannot be mistaken for a decision by a caller that
 * forgot a branch, which is the property `cancel` never had.
 *
 * `name` is `'AbortError'`, so every `err.name === 'AbortError'` check already written
 * treats it correctly — including `askUserHandler`, which used to perform this exact
 * conversion by hand. That hand-conversion existing is the evidence the shape is
 * right, and it is gone.
 */
export class AparteElicitationAbortError extends DOMException {
    /**
     * Which of the two ways it ended.
     *
     * `'no-presenter'` is a developer's setup problem and `'aborted'` is a person
     * stopping something; a host that reports them the same way reports a bug as a
     * user action. The distinction is why this carries a field at all.
     */
    readonly reason: 'aborted' | 'no-presenter';

    constructor(reason: 'aborted' | 'no-presenter' = 'aborted') {
        super(
            reason === 'no-presenter'
                ? 'No elicitation presenter is mounted, so the request could not be shown.'
                : 'The request ended without an answer.',
            'AbortError',
        );
        this.reason = reason;
    }
}

/**
 * Presents an elicitation request and resolves with the user's response, or rejects
 * with {@link AparteElicitationAbortError} when it ends without one.
 * Registered per config instance via `aparteGlobalConfig.setElicitationPresenter`
 * (the `<aparte-elicitation>` Web Component is the default presenter).
 */
export type AparteElicitationPresenter = (request: AparteElicitationRequest) => Promise<AparteElicitationResult>;
