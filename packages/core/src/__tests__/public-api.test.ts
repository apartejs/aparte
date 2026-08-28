// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as core from '../index';

/**
 * The public runtime surface, pinned.
 *
 * Before 1.0 the barrel is the contract, and an export can vanish (or appear) in
 * a refactor without a single test noticing — `changeset` descriptions are
 * written by hand, so a silent removal ships as a "patch". This snapshot makes
 * any change to the surface show up in the diff, where it can be judged: an
 * intentional addition is a one-line snapshot update, an accidental removal is
 * caught in review.
 *
 * Runtime values only — types are erased and can't break an import at runtime
 * (the `index.node` parity guard covers the SSR half of the same concern).
 */
describe('@aparte/core public API', () => {
    it('exports exactly this runtime surface', () => {
        const names = Object.keys(core).sort();
        expect(names).toMatchInlineSnapshot(`
          [
            "APARTE_CONFIG_CHANGE",
            "APARTE_CONVERSATION_SCHEMA_VERSION",
            "APARTE_DEFAULT_BUBBLE_ACTIONS",
            "APARTE_DEFAULT_HOST_HANDLERS",
            "APARTE_DEFAULT_ICON_FALLBACKS",
            "APARTE_DEFAULT_LOCALE",
            "APARTE_DEFAULT_UI_EVENTS",
            "APARTE_HOST_ATTR",
            "AparteBackendTransport",
            "AparteChat",
            "AparteChatBubble",
            "AparteChatHost",
            "AparteChatStatus",
            "AparteChatViewport",
            "AparteClient",
            "AparteComposer",
            "AparteComposerAction",
            "AparteComposerAddAttachment",
            "AparteComposerAttachments",
            "AparteComposerCancel",
            "AparteComposerInput",
            "AparteComposerSend",
            "AparteComposerToolbar",
            "AparteConfig",
            "AparteContext",
            "AparteConversationController",
            "AparteConversationList",
            "AparteConversationManager",
            "AparteDirectTransport",
            "AparteElicitation",
            "AparteElicitationAbortError",
            "AparteError",
            "AparteErrorCode",
            "AparteIcon",
            "AparteMessageRepository",
            "AparteOptgroup",
            "AparteOption",
            "AparteProgressSpinner",
            "AparteSelect",
            "AparteStreamParser",
            "AparteSuggestions",
            "aparteGlobalConfig",
            "applyElementProps",
            "attachConfig",
            "buildApprovalPanel",
            "buildElicitationPanel",
            "collectRendererStyles",
            "contentToText",
            "contextConfig",
            "createAparteChatHandler",
            "createStreamAdapter",
            "cssEscape",
            "declineDefaultRenderers",
            "defaultSanitizer",
            "deriveArtifactKind",
            "detachConfig",
            "escapeAttr",
            "escapeHtml",
            "filesToAttachments",
            "getAllRenderers",
            "getSegmentRenderer",
            "installDefaultRenderersOnce",
            "isAwaitingReply",
            "isFormatAdapter",
            "isSafeUrl",
            "isSegmentSettled",
            "parseAparteEventStream",
            "parseMarkdownToSegments",
            "populateBubbleFromMessage",
            "readableToAsyncIterable",
            "registerAllComponents",
            "registerDefaultRenderers",
            "registerSegmentRenderer",
            "requestUserInput",
            "resolveConfig",
            "revokeAttachmentUrls",
            "runWithConfig",
            "segmentDuration",
            "segmentTiming",
            "subscribeConfigChange",
            "unregisterSegmentRenderer",
            "uuid",
          ]
        `);
    });
});
