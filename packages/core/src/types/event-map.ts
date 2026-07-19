/**
 * Global typing for aparté custom events. Once `@aparte/core` is in a consumer's
 * TypeScript program, `element.addEventListener('aparte-retry', e => e.detail)`
 * types `e` as `CustomEvent<AparteRetryEventDetail>` with a typed `e.detail` — no
 * manual `(e as CustomEvent<…>).detail` cast.
 *
 * Covers the public bubble / lifecycle / artifact / tool events whose detail type
 * lives in the types layer. Internal component/primitive events (composer-submit,
 * select-change, optgroup-toggle, …) intentionally fall back to the DOM's default
 * `Event` — they carry no cross-package detail contract.
 *
 * All names are kebab-case (`aparte-*`) so every framework can bind them in a
 * template (Angular parses a `:` in an event name as a `target:event` selector,
 * so a colon name could never be `(aparte:x)`-bound there).
 */

import type {
    AparteSendEventDetail,
    AparteRetryEventDetail,
    AparteEditEventDetail,
    AparteActionEventDetail,
    ApartePathChangedEventDetail,
    AparteBranchNavigateEventDetail,
    AparteFeedbackEventDetail,
    AparteMessageInfoEventDetail,
    AparteMessageDoneEventDetail,
    AparteModelChangeEventDetail,
    AparteArtifactStartEventDetail,
    AparteArtifactDeltaEventDetail,
    AparteArtifactReadyEventDetail,
    AparteArtifactOpenEventDetail,
} from './events.js';
import type { AparteToolDecisionDetail, AparteToolApprovalRequestDetail } from './tools.js';
// event-map is a top-level aggregator (imported by the barrel, never by a
// component), so importing this component-coupled detail type is cycle-free.
import type { AparteComposerChangeEventDetail } from '../components/composer/aparte-composer.js';

declare global {
    interface HTMLElementEventMap {
        'aparte-send': CustomEvent<AparteSendEventDetail>;
        'aparte-retry': CustomEvent<AparteRetryEventDetail>;
        'aparte-edit': CustomEvent<AparteEditEventDetail>;
        'aparte-action': CustomEvent<AparteActionEventDetail>;
        'aparte-path-changed': CustomEvent<ApartePathChangedEventDetail>;
        'aparte-branch-navigate': CustomEvent<AparteBranchNavigateEventDetail>;
        'aparte-feedback': CustomEvent<AparteFeedbackEventDetail>;
        'aparte-message-info': CustomEvent<AparteMessageInfoEventDetail>;
        'aparte-message-done': CustomEvent<AparteMessageDoneEventDetail>;
        'aparte-model-change': CustomEvent<AparteModelChangeEventDetail>;
        'aparte-artifact-start': CustomEvent<AparteArtifactStartEventDetail>;
        'aparte-artifact-delta': CustomEvent<AparteArtifactDeltaEventDetail>;
        'aparte-artifact-ready': CustomEvent<AparteArtifactReadyEventDetail>;
        'aparte-artifact-open': CustomEvent<AparteArtifactOpenEventDetail>;
        'aparte-tool-decision': CustomEvent<AparteToolDecisionDetail>;
        'aparte-tool-approval-request': CustomEvent<AparteToolApprovalRequestDetail>;
        // Forwarded by the wrappers' AparteUi (in DEFAULT_UI_EVENTS); detail is
        // component-coupled but event-map is a top-level aggregator, so typing it here.
        'aparte-composer-change': CustomEvent<AparteComposerChangeEventDetail>;
    }
}

export {};
