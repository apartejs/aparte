/*
 * What no metadata carries, for `scripts/gen-element-bindings.mjs`.
 *
 * Everything else about a binding is derived: the tag, the attributes and their types,
 * the events and their detail types, every description. What cannot be derived is a
 * NAME that would collide, an OWNERSHIP that the manifest does not record, and WHERE an
 * event goes out — each one found by hand-writing the directives first and hitting it.
 * The first two are judgment calls; the third is a fact, and `check-event-map` (rule 6)
 * holds it equal to the source.
 */
export default {
    /**
     * Attributes that must not become an Angular `@Input()`.
     *
     * They stay in the attribute TYPE, because they are real attributes a consumer can
     * read — they only must not be bindable.
     */
    angularInputOmit: {
        // `role` here is the message role, and `role` is also ARIA's. An `@Input() role`
        // on the directive would shadow ARIA's in every template that uses the element.
        // `data-role` carries the same value and is bindable as `messageRole` below.
        // `data-checkpoint` is the other one: the viewport and the host write it while a
        // compaction is pending or has failed, and clear it after. A template binding would
        // fight them for a value only core may write.
        'aparte-chat-bubble': ['role', 'data-checkpoint'],
        // Reflected BY the element onto itself while it holds no element child. A
        // template binding would fight the element for a value the element owns.
        'aparte-composer-toolbar': ['data-empty'],
        // The same: reflected by the element (the first key, pointer or send; a search that
        // matches nothing), never the template's to set.
        'aparte-chat': ['data-glide'],
        'aparte-conversation-list': ['data-no-match'],
        'aparte-launcher': ['data-sheet'],
    },

    /**
     * Event → the name it binds under, per element, where `aparte-x-y` → `xY` is not enough.
     *
     * One map for every binding the generator writes: the chat's (`aparte-chat`: React's
     * `on…` prop, Vue's emit, Svelte's event and `on…` callback, Angular's output) and each
     * Angular element directive's outputs. The generator refuses a name that is a native DOM
     * event, a name the chat components give a host callback, and two events on one name,
     * and its message names the entry to add here.
     */
    bindingRenames: {
        'aparte-chat': {
            // The name all four wrappers published long before the bindings were generated.
            'aparte-send': 'messageSent',
            // `cancel` is a DOM event, and it bubbles: a file input fires it when its picker
            // closes with no choice. Angular's `(cancel)` would bind it AND the output.
            'aparte-cancel': 'stop',
        },
        // The same clash on the composer's own directive: `(cancel)` ran for the Stop button
        // and for every native `cancel` beneath it. Its `(send)` is no DOM event, and stays.
        'aparte-composer': {
            'aparte-cancel': 'stop',
        },
    },

    /** Attribute → the Angular Input name, where camelCasing it is not enough. */
    angularInputRename: {
        'aparte-chat-bubble': {
            // `dataRole` would be a strange thing to write; the value IS the message role.
            'data-role': 'messageRole',
            // `id` is too generic on a directive whose host is one message.
            'message-id': 'messageId',
        },
    },

    /**
     * Events an element declares and sends only on `window` — so none becomes an Angular
     * `@Output()`.
     *
     * The manifest records that the element fires them; it cannot record that they go
     * out on `window` rather than on the element, so a host listener would never hear
     * them and the Output would be a promise nothing keeps. They concern the whole page.
     *
     * A fact, not a choice: `check-event-map` (rule 6) reads every element's dispatch
     * sites and fails when this list and the source disagree, either way. It used to be
     * called `angularOutputOmit` and kept by hand, and it fell behind — `<aparte-context>`
     * was missing, so its directive offered a `(compact)` Output that could never fire.
     */
    windowDispatched: {
        'aparte-composer': ['aparte-abort', 'aparte-message-aborted'],
        // A compaction is a request for the whole page, answered on `window`: the bubble
        // dispatches both from its Retry and Restore buttons, so a host listener on the
        // bubble would never hear them.
        'aparte-chat-bubble': ['aparte-compact', 'aparte-compact-done'],
        // The gauge's Retry, when no compactor is registered: the same page-wide request.
        'aparte-context': ['aparte-compact'],
    },

    /**
     * Boolean attributes whose default is ON, turned off only by the literal `"false"`.
     *
     * The manifest says `{boolean}` and nothing more, so the generator treated all 17 as
     * PRESENCE attributes — absent means off, `""` means on. For these two that is
     * exactly backwards, and it made `[multiple]="false"` turn multi-file selection ON:
     * `false` removed the attribute, and the element reads
     * `!hasAttribute('multiple') || getAttribute('multiple') !== 'false'`, so absent is
     * TRUE. The only value that turns it off is the string `"false"`, which no generated
     * binding could produce and which the template types could not even express.
     *
     * Not a hypothetical: `AparteChat.tsx` already worked around it by hand, writing
     * `submit-on-enter={submitOnEnter ? undefined : 'false'}` — the wrapper's author knew
     * the semantics and the generator did not. This is where that knowledge goes.
     *
     * Grep for the shape before adding one: `!== 'false'` in an element's read path.
     */
    threeStateBooleans: {
        // aparte-composer-add-attachment.ts — `input.multiple = !hasAttribute(…) || … !== 'false'`
        'aparte-composer-add-attachment': ['multiple'],
        // aparte-composer.ts — `get submitOnEnter() { return getAttribute(…) !== 'false'; }`
        'aparte-composer': ['submit-on-enter'],
        // aparte-launcher.ts — `get header() { return getAttribute('header') !== 'false'; }`
        'aparte-launcher': ['header'],
    },

    /**
     * Tags that already have a richer binding, so no directive is generated.
     *
     * `AparteChatComponent` claims `<aparte-chat>` and renders the whole turn through
     * `AparteChatHost`. A directive for it would be a second thing fighting for the
     * same selector.
     */
    angularSkip: ['aparte-chat'],

    /**
     * The same for React: no component is generated for these tags.
     *
     * `<AparteChat>` is a composite that renders the chat's own parts through `AparteChatHost`;
     * a component for `<aparte-chat>` would take the name it owns. The generator refuses a
     * component named like something the React package exports, so removing the entry fails
     * the build rather than shadowing the composite.
     */
    reactSkip: ['aparte-chat'],

    /**
     * Attributes an element reads ONCE, when it connects, so they must be in its first markup.
     *
     * The generated React components apply an attribute after the element is in the document
     * (`applyElementProps`, in an effect), which is right for every attribute the element
     * observes or reads when it needs it, and too late for one it reads at connect. The
     * viewport is the case: it decides at connect whether it builds its own wrapper or leaves its
     * children to the framework, and `framework-managed` arriving after moves the framework's
     * bubbles into the wrapper and breaks its reconciliation. These are rendered with the
     * element instead, as the string they are.
     *
     * Not in the manifest as a fact: the attribute's description says "read once at connect",
     * which is prose. Grep an element's `connectedCallback` for `hasAttribute` before adding one;
     * the generator refuses an entry for an attribute the element does not declare.
     */
    readAtConnect: {
        // aparte-chat-viewport.ts — `if (this.hasAttribute('framework-managed')) this._frameworkManagedDOM = true;`
        'aparte-chat-viewport': ['framework-managed'],
    },
};
