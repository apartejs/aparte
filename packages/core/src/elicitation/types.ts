/**
 * Elicitation — the generic "pause the run and ask the user for typed input"
 * primitive. Generalises the bespoke `ask_question` tool: the KIND of question
 * is carried by a flat schema, not by a dedicated tool. Shape is aligned with
 * MCP elicitation (message + requested schema, accept/decline/cancel), but the
 * mechanism is transport-agnostic and framework-agnostic — a typed presenter
 * registered per config instance, never window events.
 */

/** A single choice field: radios (default) or checkboxes (`multiple`). */
export interface AparteElicitationEnumField {
    type: 'enum';
    title?: string;
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
     * Aborts the request — the presenter settles `cancel` and closes the panel.
     * Pass a tool handler's signal so a client-side timeout or turn abort tears
     * the panel down instead of leaving it open.
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
    | { action: 'decline' }
    | { action: 'cancel' };

/**
 * Presents an elicitation request and resolves with the user's response.
 * Registered per config instance via `AparteConfig.setElicitationPresenter`
 * (the `<aparte-elicitation>` Web Component is the default presenter).
 */
export type AparteElicitationPresenter = (request: AparteElicitationRequest) => Promise<AparteElicitationResult>;
