/**
 * Global typing for the aparté custom elements. Once `@aparte/core` is in a
 * consumer's TypeScript program, `document.querySelector('aparte-composer-input')`
 * returns `AparteComposerInput | null` instead of `Element | null` — no cast, and
 * the element's own properties and methods are reachable.
 *
 * One file holds the whole element surface, next to the `customElements.define` calls
 * it has to agree with. A tag missing from the map makes `querySelector('aparte-x')`
 * return `Element` and leaves its `event.detail` untyped, and that includes the
 * `aparte-composer-*` primitives of the "compose your own composer" path.
 *
 * Completeness is not left to convention. It is pinned at the bottom of this file by a
 * type assertion against the GENERATED `AparteElementTagName`, which is built from the
 * custom-elements manifest and therefore carries every tag by construction. A missing
 * entry is a type error naming the tag, so it fails `nx typecheck` and with it the
 * pre-commit hook; the converse — a key here no element backs — is checked at runtime by
 * `types/__tests__/element-map.test.ts`, for the reason given beside the assertion.
 *
 * Every import is `import type`, so nothing is emitted and this cannot introduce a
 * runtime cycle — the same reason `event-map.ts` can name a component-coupled detail
 * type from the types layer.
 *
 * `declare global` DECLARES `HTMLElementTagNameMap` where the DOM lib is absent rather
 * than requiring it, so `index.node.ts` imports this file too — deliberately, and
 * `check-node-barrel-types.mjs` asserts it does — and a server-side program gets the
 * same tag typing.
 */

import type { AparteChat } from '../components/chat/aparte-chat.js';
import type { AparteChatBubble } from '../components/bubble/aparte-chat-bubble.js';
import type { AparteChatStatus } from '../components/status/aparte-chat-status.js';
import type { AparteChatViewport } from '../components/viewport/aparte-chat-viewport.js';
import type { AparteComposer } from '../components/composer/aparte-composer.js';
import type { AparteComposerInput } from '../components/composer/aparte-composer-input.js';
import type { AparteComposerSend } from '../components/composer/aparte-composer-send.js';
import type { AparteComposerCancel } from '../components/composer/aparte-composer-cancel.js';
import type { AparteComposerAttachments } from '../components/composer/aparte-composer-attachments.js';
import type { AparteComposerAddAttachment } from '../components/composer/aparte-composer-add-attachment.js';
import type { AparteComposerAction } from '../components/composer/aparte-composer-action.js';
import type { AparteComposerToolbar } from '../components/composer/aparte-composer-toolbar.js';
import type { AparteConversationList } from '../components/conversation-list/aparte-conversation-list.js';
import type { AparteElicitation } from '../components/elicitation/aparte-elicitation.js';
import type { AparteScrollRail } from '../components/scroll-rail/aparte-scroll-rail.js';
import type { AparteSidebar } from '../components/sidebar/aparte-sidebar.js';
import type { AparteSplit } from '../components/split/aparte-split.js';
import type { AparteLauncher } from '../components/launcher/aparte-launcher.js';
import type { AparteSuggestions } from '../components/suggestions/aparte-suggestions.js';
import type { AparteContext } from '../components/context/aparte-context.js';
import type { AparteSelect } from '../primitives/select/aparte-select.js';
import type { AparteOption } from '../primitives/select/aparte-option.js';
import type { AparteOptgroup } from '../primitives/select/aparte-optgroup.js';
import type { AparteProgressSpinner } from '../primitives/progress-spinner/aparte-progress-spinner.js';
import type { AparteIcon } from '../primitives/icon/aparte-icon.js';
import type { AparteElementTagName } from './element-attributes.js';

declare global {
    interface HTMLElementTagNameMap {
        // Chat shell + transcript
        'aparte-chat': AparteChat;
        'aparte-chat-viewport': AparteChatViewport;
        'aparte-chat-bubble': AparteChatBubble;
        'aparte-chat-status': AparteChatStatus;

        // Composer and its primitives — the "compose your own" surface
        'aparte-composer': AparteComposer;
        'aparte-composer-input': AparteComposerInput;
        'aparte-composer-send': AparteComposerSend;
        'aparte-composer-cancel': AparteComposerCancel;
        'aparte-composer-attachments': AparteComposerAttachments;
        'aparte-composer-add-attachment': AparteComposerAddAttachment;
        'aparte-composer-action': AparteComposerAction;
        'aparte-composer-toolbar': AparteComposerToolbar;

        // Standalone components
        'aparte-conversation-list': AparteConversationList;
        'aparte-elicitation': AparteElicitation;
        'aparte-scroll-rail': AparteScrollRail;
        'aparte-sidebar': AparteSidebar;
        'aparte-split': AparteSplit;
        'aparte-launcher': AparteLauncher;
        'aparte-suggestions': AparteSuggestions;
        'aparte-context': AparteContext;

        // Primitives
        'aparte-select': AparteSelect;
        'aparte-option': AparteOption;
        'aparte-optgroup': AparteOptgroup;
        'aparte-progress-spinner': AparteProgressSpinner;
        'aparte-icon': AparteIcon;
    }
}

/**
 * The pin. `AparteElementTagName` is generated from the manifest, so it is total by
 * construction, and this alias stops compiling the moment an element core defines is
 * missing from the map above. The failure names the tag: dropping `aparte-split` reads
 * `Type '{ unmapped: "aparte-split"; }' does not satisfy the constraint 'true'`.
 *
 * A type assertion rather than a script, because this runs where the mistake is made —
 * in the editor, and in `nx typecheck`, which is what the pre-commit hook runs. Nothing
 * is emitted: it is a type.
 *
 * The OTHER direction — a key here that no element backs — cannot be checked this way,
 * and the attempt is instructive: `HTMLElementTagNameMap` is a global open interface,
 * and the plugins augment it too, so `keyof` sees `aparte-ask-user` and
 * `aparte-model-selector` the moment a program contains both packages. That direction
 * is checked at runtime instead, against the `customElements.define` literals, in
 * `types/__tests__/element-map.test.ts`.
 */
type Assert<T extends true> = T;

/** Every `aparte-*` key visible on `HTMLElementTagNameMap` — this file's, and any plugin's. */
type MappedAparteTag = Extract<keyof HTMLElementTagNameMap, `aparte-${string}`>;

type _EveryDefinedTagIsMapped = Assert<
    [Exclude<AparteElementTagName, MappedAparteTag>] extends [never]
        ? true
        : { unmapped: Exclude<AparteElementTagName, MappedAparteTag> }
>;

export type { _EveryDefinedTagIsMapped };

export {};
