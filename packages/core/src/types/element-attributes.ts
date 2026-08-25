/**
 * The attribute surface of every aparté element, as types.
 *
 * Written here once because all four framework wrappers need the same facts, and a
 * copy per wrapper is four copies to drift. What each wrapper adds is its own
 * ATTRIBUTE IDIOM, which genuinely differs — React writes a presence attribute as
 * `'' | undefined` (see `AparteChat.tsx`: `streaming={… ? '' : undefined}`), Angular
 * routes it through `booleanAttribute` and `setAttribute` — so they map over these
 * semantic types rather than redeclaring them.
 *
 * ## Why these are semantic, not stringly
 *
 * Every HTML attribute is a string on the wire, so typing them all `string` would be
 * true and useless. `boolean` here means a PRESENCE attribute: set it and the element
 * observes it, remove it and it does not. `number` means the element parses the string
 * it reads. That distinction is the whole value of this file — it is what lets a
 * wrapper reject `disabled="maybe"` and accept `disabled`.
 *
 * ## Events are deliberately NOT here
 *
 * They already have a guarded home. `types/event-map.ts` maps every event name to its
 * `CustomEvent<Detail>` and augments `HTMLElementEventMap`, and
 * `scripts/check-event-map.mjs` fails in both directions — a dispatched detail that is
 * not mapped, and a mapped name nothing dispatches. So
 * `HTMLElementEventMap['aparte-select-change']` already types `e.detail` for every
 * consumer in every framework, with no second list to keep in step. Adding one would
 * repeat the exact defect that made this lot necessary: a hand-maintained parallel
 * structure with nothing watching it.
 *
 * Keep in step with `packages/core/dist/custom-elements.json` — the element guard
 * checks that the two agree.
 */

/** `<aparte-chat>` — the default composition. */
export interface AparteChatAttributes {
    /** Placeholder for the composer input of the default composition. */
    placeholder?: string;
    /** Disables the composer. */
    disabled?: boolean;
    /** Centres the composer as a welcome state until the first message. */
    'center-empty'?: boolean;
    /** Adds the file picker and the chips strip. Opt-in: the host must consume the files. */
    attachments?: boolean;
    /**
     * The wrapper's hands-off signal: set it and the element composes none of its own
     * children. All four wrappers set it, `aparte-chat` reads it, and nothing declared
     * it — found because typing the Svelte templates rejected the wrapper's own markup.
     */
    'framework-managed'?: boolean;
}

/** `<aparte-chat-viewport>` — the transcript surface. */
export interface AparteChatViewportAttributes {
    /** The wrapper's hands-off signal; the viewport reads it as `_frameworkManagedDOM`. */
    'framework-managed'?: boolean;
    /** How close to the bottom still counts as being at the bottom. */
    'scroll-threshold'?: number;
    /** Caps how many bubbles stay in the DOM. */
    'max-rendered-bubbles'?: number;
    /**
     * @deprecated Use `max-rendered-bubbles`. It used to evict messages from the model
     * and now only caps rendered bubbles, so the name promises something it no longer
     * does; the element logs a warning when it is set. For real history retention,
     * configure the conversation manager.
     */
    'max-messages'?: number;
}

/** `<aparte-chat-bubble>` — one message. */
export interface AparteChatBubbleAttributes {
    /** The message role. */
    role?: string;
    /** `user` / `assistant` / `system` — what the CSS keys off. */
    'data-role'?: string;
    /** Plain text content, for a bubble with no segments. */
    content?: string;
    /**
     * Epoch milliseconds, or a date string. The element coerces only when the value
     * is numeric, so both work — and typing this `string` alone was caught by the
     * wrapper's own bubble rendering, which passes `m.timestamp`, a number.
     */
    timestamp?: number | string;
    /** How streaming and the action bar address this bubble. */
    'message-id'?: string;
    /** Hides the action bar and shows the caret while a reply is in flight. */
    streaming?: boolean;
    /** The display name in the header. */
    name?: string;
}

/** `<aparte-chat-status>` — a standalone status line the app owns. */
export interface AparteChatStatusAttributes {
    /** Shows or hides the indicator. */
    visible?: boolean;
    /** The line to show. Defaults to the locale's typing string. */
    text?: string;
}

/** `<aparte-composer>` — the root context for every composer part. */
export interface AparteComposerAttributes {
    /** Forwarded to `<aparte-composer-input>` through the internal bus. */
    placeholder?: string;
    /** Disables the whole composer, every part included. */
    disabled?: boolean;
    /** The id of the `<aparte-chat>` this composer drives. */
    target?: string;
}

/** `<aparte-composer-input>` — the contenteditable field. */
export interface AparteComposerInputAttributes {
    /** Makes the field non-editable. */
    disabled?: boolean;
    /** Placeholder text; falls back to the composer's own. */
    placeholder?: string;
    /** Max height in px before it scrolls. */
    'max-height'?: number;
    /** Min height in px. Omit to let the stylesheet govern. */
    'min-height'?: number;
}

/** `<aparte-composer-action>` — a generic action button. */
export interface AparteComposerActionAttributes {
    /** Icon key for `getIcon()`, or raw SVG/HTML starting with a tag. */
    icon?: string;
    /** Accessible label, also used as the tooltip. */
    label?: string;
    /** Disables the button. */
    disabled?: boolean;
}

/** `<aparte-composer-add-attachment>` — the file picker. */
export interface AparteComposerAddAttachmentAttributes {
    /** MIME types / extensions passed to the file input. */
    accept?: string;
    /** Allows selecting several files. */
    multiple?: boolean;
    /** Greys out the picker and ignores drops. */
    disabled?: boolean;
}

/** `<aparte-composer-toolbar>` — the composer's bottom row. */
export interface AparteComposerToolbarAttributes {
    /** Reflected BY the element while it holds no element child. Read it, do not set it. */
    'data-empty'?: boolean;
}

/** `<aparte-conversation-list>` — the history sidebar. */
export interface AparteConversationListAttributes {
    /** The id of the conversation to render as selected. */
    'active-id'?: string;
}

/** `<aparte-select>` — the dropdown primitive. */
export interface AparteSelectAttributes {
    /** The selected option's value. */
    value?: string;
    /** Shown while nothing is selected. */
    placeholder?: string;
    /** Blocks opening and selection. */
    disabled?: boolean;
    /** Renders `<aparte-optgroup>` children as collapsible groups. */
    grouped?: boolean;
    /** Adds a filter field above the options. */
    searchable?: boolean;
    /** Reflects (and controls) whether the dropdown is open. */
    open?: boolean;
}

/** `<aparte-option>` — one option inside `<aparte-select>`. */
export interface AparteOptionAttributes {
    /** The option's value. */
    value?: string;
    /** Cannot be selected. */
    disabled?: boolean;
    /** Reflects the selection. */
    selected?: boolean;
    /** Free-form status the host sets; styled, never read by core. */
    'data-status'?: string;
}

/** `<aparte-optgroup>` — a group of options. */
export interface AparteOptgroupAttributes {
    /** The group's label. */
    label?: string;
    /** Allows collapsing and expanding. */
    collapsible?: boolean;
    /** The collapsed state. */
    collapsed?: boolean;
    /** Shows a spinner in place of the group's options. */
    loading?: boolean;
}

/** `<aparte-progress-spinner>` — determinate with `value`, indeterminate without. */
export interface AparteProgressSpinnerAttributes {
    /** Percentage 0-100. Omit for the indeterminate spin. */
    value?: number;
}

/**
 * `<aparte-model-selector>` — from `@aparte/plugin-model-selector`, not from core.
 *
 * Declared here anyway, and the precedent is core's own: `types/event-map.ts` already
 * maps `aparte-model-change`, and its detail type is defined in `types/events.ts`. Core
 * knowing the SHAPE of an optional element's surface is not core depending on it —
 * nothing here imports the package, and the tag simply stays inert until a consumer
 * imports it. Leaving it out would mean the most-placed element in the library is the
 * one element no wrapper can type.
 */
export interface AparteModelSelectorAttributes {
    /** Selects the first model as soon as one is available. */
    'auto-select'?: boolean;
    /** Writes the selection back through the config, so it survives a reload. */
    persist?: boolean;
    /** Adds the dropdown's filter field. */
    searchable?: boolean;
    /** Overrides the text shown while nothing is selected. */
    placeholder?: string;
}

/**
 * `<aparte-composer-send>`, `<aparte-composer-cancel>`, `<aparte-composer-attachments>`
 * and `<aparte-elicitation>` observe no attribute at all: they read the composer's
 * shared state, or they render nothing of their own. An empty surface is the honest
 * declaration — it says "checked, there are none", where an absent entry would only
 * say "not looked at".
 */
export type AparteNoAttributes = Record<never, never>;

/**
 * Tag name to its attribute surface. This is the registry a wrapper maps over to build
 * its own idiom, and keeping it TOTAL is what makes a forgotten element a type error
 * rather than a silently untyped tag.
 */
export interface AparteElementAttributes {
    'aparte-chat': AparteChatAttributes;
    'aparte-chat-viewport': AparteChatViewportAttributes;
    'aparte-chat-bubble': AparteChatBubbleAttributes;
    'aparte-chat-status': AparteChatStatusAttributes;
    'aparte-composer': AparteComposerAttributes;
    'aparte-composer-input': AparteComposerInputAttributes;
    'aparte-composer-send': AparteNoAttributes;
    'aparte-composer-cancel': AparteNoAttributes;
    'aparte-composer-action': AparteComposerActionAttributes;
    'aparte-composer-add-attachment': AparteComposerAddAttachmentAttributes;
    'aparte-composer-attachments': AparteNoAttributes;
    'aparte-composer-toolbar': AparteComposerToolbarAttributes;
    'aparte-conversation-list': AparteConversationListAttributes;
    'aparte-elicitation': AparteNoAttributes;
    'aparte-select': AparteSelectAttributes;
    'aparte-option': AparteOptionAttributes;
    'aparte-optgroup': AparteOptgroupAttributes;
    'aparte-progress-spinner': AparteProgressSpinnerAttributes;
    // From the plugins. Present so a wrapper can type them; inert until imported.
    'aparte-model-selector': AparteModelSelectorAttributes;
    'aparte-ask-user': AparteNoAttributes;
}

/**
 * One attribute as a TEMPLATE must write it.
 *
 * A presence attribute becomes `'' | undefined`, never `boolean`, and that is not
 * pedantry — it is the same trap in all three template languages. React, Vue and Svelte
 * all stringify what they set on a custom element, so `disabled={false}` renders
 * `disabled="false"`, and an element that tests `hasAttribute` reads that as ON. The
 * wrapper's own bubble rendering already used the right spelling
 * (`streaming={… ? '' : undefined}`); this makes it the only one that type-checks.
 *
 * `null` is in the union alongside `undefined` because all three treat it as REMOVE,
 * and Vue's own wrapper template writes exactly that (`:streaming="… ? '' : null"`).
 * Leaving it out made the wrapper's own code fail to type-check — the second time the
 * existing wrappers corrected a declaration here, after `timestamp`, which the React
 * bubble rendering proved accepts a number.
 *
 * A numeric attribute takes a number or the string it becomes, because both read
 * naturally in a template.
 *
 * Angular does NOT use this: its directives take `boolean` through `booleanAttribute`
 * and write the attribute themselves, so a consumer there writes `[disabled]="busy"`.
 * That difference is the whole reason this is a mapping and not the declared type.
 */
export type AparteAttrValue<T> = T extends boolean ? '' | null | undefined
    : T extends number ? number | string
    : T;

/** An element's attribute surface, in template spelling. Used by three of four wrappers. */
export type AparteTemplateAttrs<T> = { [K in keyof T]?: AparteAttrValue<NonNullable<T[K]>> };

/** Every tag aparté defines, derived from the registry so the two cannot diverge. */
export type AparteElementTagName = keyof AparteElementAttributes;
