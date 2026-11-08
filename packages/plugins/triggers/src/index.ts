/**
 * `@aparte/plugin-triggers`: `/` commands, `@` mentions and any other trigger in the composer.
 *
 * Core gives the field a caret and tokens; this draws the menu on core's `.aparte-menu`
 * recipe. Other plugins add commands by answering `aparte-collect-commands`, so none of them
 * imports this package, and this one imports none of them.
 */
export { AparteTriggers } from './aparte-triggers.js';
export { detectTrigger } from './detect.js';
export type { TriggerHit } from './detect.js';
export { matchRows, scoreItem } from './match.js';
export type { TriggerRow } from './match.js';
export type {
    AparteCollectCommandsEventDetail,
    AparteCommandContext,
    AparteCommand,
    AparteCommandScope,
    AparteTrigger,
    AparteTriggerCommands,
    AparteTriggerContext,
    AparteTriggerItem,
    AparteTriggerSelectEventDetail,
    AparteTriggerSource,
} from './types.js';

declare global {
    interface HTMLElementTagNameMap {
        'aparte-triggers': import('./aparte-triggers.js').AparteTriggers;
    }
}
