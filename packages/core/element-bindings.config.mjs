/*
 * The judgment calls no metadata carries, for `scripts/gen-element-bindings.mjs`.
 *
 * Everything else about a binding is derived: the tag, the attributes and their types,
 * the events and their detail types, every description. What cannot be derived is a
 * NAME that would collide and an OWNERSHIP that the manifest does not record. Three
 * cases, each one found by hand-writing the directives first and hitting it.
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
        'aparte-chat-bubble': ['role'],
        // Reflected BY the element onto itself while it holds no element child. A
        // template binding would fight the element for a value the element owns.
        'aparte-composer-toolbar': ['data-empty'],
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
     * Events that must not become an Angular `@Output()`.
     *
     * The manifest records that the element fires them; it cannot record that they go
     * out on `window` rather than on the element, so a host listener would never hear
     * them and the Output would be a promise nothing keeps. They concern the whole page.
     */
    angularOutputOmit: {
        'aparte-composer': ['aparte-abort', 'aparte-message-aborted'],
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
    },

    /**
     * Tags that already have a richer binding, so no directive is generated.
     *
     * `AparteChatComponent` claims `<aparte-chat>` and renders the whole turn through
     * `AparteChatHost`. A directive for it would be a second thing fighting for the
     * same selector.
     */
    angularSkip: ['aparte-chat'],
};
