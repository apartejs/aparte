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
            "APARTE_CONVERSATION_SCHEMA_VERSION",
            "APARTE_HOST_ATTR",
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
            "AparteConfigClass",
            "AparteConversationController",
            "AparteConversationList",
            "AparteElicitation",
            "AparteError",
            "AparteErrorCode",
            "AparteOptgroup",
            "AparteOption",
            "AparteProgressSpinner",
            "AparteSelect",
            "AparteStreamParser",
            "BackendTransport",
            "ConversationManager",
            "DEFAULT_BUBBLE_ACTIONS",
            "DEFAULT_HOST_HANDLERS",
            "DEFAULT_ICON_FALLBACKS",
            "DEFAULT_LOCALE",
            "DEFAULT_SKELETON_FALLBACKS",
            "DEFAULT_UI_EVENTS",
            "DirectTransport",
            "MessageRepository",
            "applyElementProps",
            "attachConfig",
            "buildElicitationPanel",
            "collectRendererStyles",
            "contentToText",
            "contextConfig",
            "createAparteChatHandler",
            "createStreamAdapter",
            "defaultSanitizer",
            "deriveArtifactKind",
            "detachConfig",
            "escapeAttr",
            "escapeHtml",
            "filesToAttachments",
            "getSegmentRenderer",
            "isAwaitingReply",
            "isFormatAdapter",
            "isSafeUrl",
            "parseAparteEventStream",
            "parseMarkdownToSegments",
            "populateBubbleFromMessage",
            "readableToAsyncIterable",
            "registerAllComponents",
            "registerDefaultRenderers",
            "registerSegmentRenderer",
            "requestUserInput",
            "resolveConfig",
            "runWithConfig",
            "unregisterSegmentRenderer",
          ]
        `);
    });
});
