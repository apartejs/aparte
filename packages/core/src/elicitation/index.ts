/**
 * Elicitation — public surface.
 *
 * `requestUserInput(req)` is the free-function entry a tool handler calls: it
 * resolves the config governing `req.target` (the instance the request belongs
 * to, or the global default) and delegates to that config's presenter. This is
 * what `ask_question` and tool-approval adapters use — they never touch window
 * events, so there is no stringly-typed contract to drift.
 */

import { resolveConfig } from '../config/config-context.js';
import type { AparteElicitationRequest, AparteElicitationResult } from './types.js';

export type {
    AparteElicitationSchema,
    AparteElicitationField,
    AparteElicitationEnumField,
    AparteElicitationBooleanField,
    AparteElicitationStringField,
    AparteElicitationObjectSchema,
    AparteElicitationRequest,
    AparteElicitationResult,
    AparteElicitationPresenter,
} from './types.js';
export { buildElicitationPanel } from './panel.js';
export type { BuiltElicitationPanel } from './panel.js';

/**
 * Ask the user for typed input and await their response, on the config
 * governing `request.target` (its instance config, or the global default).
 * Resolves `accept` / `decline` / `cancel`.
 */
export function requestUserInput(request: AparteElicitationRequest): Promise<AparteElicitationResult> {
    return resolveConfig(request.target ?? null).requestUserInput(request);
}
