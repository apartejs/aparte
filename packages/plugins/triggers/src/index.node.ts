/**
 * `@aparte/plugin-triggers`, the DOM-free entry for Node and SSR: what a server can use. The
 * element needs a document, so only its type is here.
 */
export { detectTrigger } from './detect.js';
export type { TriggerHit } from './detect.js';
export { matchRows, scoreItem } from './match.js';
export type { TriggerRow } from './match.js';
export type { AparteTriggers } from './aparte-triggers.js';
export type {
    AparteCollectCommandsDetail,
    AparteCommand,
    AparteCommandScope,
    AparteTrigger,
    AparteTriggerCommands,
    AparteTriggerContext,
    AparteTriggerItem,
    AparteTriggerSelectEventDetail,
    AparteTriggerSource,
} from './types.js';
