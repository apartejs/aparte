/**
 * Global typing for the aparté custom elements. Once `@aparte/core` is in a
 * consumer's TypeScript program, `document.querySelector('aparte-composer-input')`
 * returns `AparteComposerInput | null` instead of `Element | null` — no cast, and
 * the element's own properties and methods are reachable.
 *
 * This used to live inline: each component appended its own
 * `declare global { interface HTMLElementTagNameMap { … } }` at the bottom of its
 * file. Seven of the eighteen elements did; the other eleven did not, and nothing
 * could notice. The consequence was not abstract — the canonical example in the
 * generated API reference, `list.conversations = [...]` after a
 * `querySelector('aparte-conversation-list')`, could not compile, and the same held
 * for every `aparte-composer-*` primitive on the "compose your own composer" path
 * that `getting-started` recommends.
 *
 * One file instead of eighteen for one reason: a per-component convention cannot be
 * enforced, and it was not. Here the whole element surface is in one place, next to
 * the `customElements.define` calls it has to agree with, which is what makes
 * `pnpm check:element-map` a five-line diff rather than a parser.
 *
 * Every import is `import type`, so nothing is emitted and this cannot introduce a
 * runtime cycle — the same reason `event-map.ts` can name a component-coupled detail
 * type from the types layer.
 *
 * DOM-only, therefore imported by `index.ts` and NOT by `index.node.ts`:
 * `HTMLElementTagNameMap` does not exist without the DOM lib.
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
import type { AparteSelect } from '../primitives/select/aparte-select.js';
import type { AparteOption } from '../primitives/select/aparte-option.js';
import type { AparteOptgroup } from '../primitives/select/aparte-optgroup.js';
import type { AparteProgressSpinner } from '../primitives/progress-spinner/aparte-progress-spinner.js';
import type { AparteIcon } from '../primitives/icon/aparte-icon.js';

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

        // Primitives
        'aparte-select': AparteSelect;
        'aparte-option': AparteOption;
        'aparte-optgroup': AparteOptgroup;
        'aparte-progress-spinner': AparteProgressSpinner;
        'aparte-icon': AparteIcon;
    }
}

export {};
