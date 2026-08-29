/**
 * Every translatable string core itself renders — the CLOSED list.
 *
 * Core keeps only the English default in memory (`APARTE_DEFAULT_LOCALE`); other
 * languages arrive through `aparteGlobalConfig.setLocale()`.
 *
 * Closed, and an alias rather than an interface, on purpose. This used to end with
 * `[key: string]: string | undefined`, and that one line disabled the only
 * compile-time check the locale had: `AparteConfig.t(key: keyof AparteLocale)` looks
 * airtight, but with an index signature `keyof` widens to `string` and EVERY literal
 * typechecks. A renamed key compiled clean, `t()` returned `''` at runtime, and the UI
 * rendered an empty label with no error and no warning — which is how `submitButton`,
 * `stopButton` and `actionUpload` each shipped read-but-never-declared, the last one
 * reported by a user from a live language switcher.
 *
 * The open half is {@link AparteLocaleExtensions}, and an ALIAS is what lets the two
 * meet: TypeScript gives a type alias an implicit index signature and an interface
 * none, so only this form is assignable to the extensions record that
 * `setLocale`/`extendLocale` accept and `getLocale` returns.
 */
export type AparteLocale = {
    // --- Input Area ---
    inputPlaceholder: string;
    sendButton: string;

    // --- Message Actions ---
    copy: string;
    copied: string;
    retry: string;

    // --- Status Indicators ---
    thinking: string;
    typing: string; // Core status: "Typing..."
    error: string;
    running: string; // Terminal running state

    // --- Terminal ---
    run: string; // "Run" button

    // --- Files ---
    file: string; // Generic "File" label

    // --- Role Names ---
    /** Display name shown above the user's messages (default: "You") */
    roleNameUser: string;
    /** Display name shown above the assistant's messages (default: "Assistant") */
    roleNameAssistant: string;

    // --- Aria labels (bubble / message) ---
    yourMessage: string;
    assistantResponse: string;
    messageActions: string;

    // --- Action buttons ---
    edit: string;
    editConfirm: string;
    editCancel: string;
    feedbackPositive: string;
    feedbackNegative: string;
    previousResponse: string;
    nextResponse: string;
    /** Approve button on a tool awaiting human approval (default: "Approve") */
    approveTool?: string;
    /** Reject button on a tool awaiting human approval (default: "Reject") */
    rejectTool?: string;
    /** Aria-label / tooltip for the message info ("i") action button (default: "Details") */
    messageInfo?: string;

    // --- Conversation list ---
    /** Default title for a new conversation (default: "New Chat") */
    newChat: string;
    /**
     * The "Delete" item of a row's menu (default: "Delete"). Used to be the aria-label
     * of a permanent ✕ on every row ("Delete conversation"); the menu is named after
     * the row, so the item carries only the verb.
     */
    deleteConversation: string;
    /** The "Archive" item of a row's menu (default: "Archive") */
    archiveConversation?: string;
    /** The same item on an archived row (default: "Unarchive") */
    unarchiveConversation?: string;
    /** Accessible name of the ⋯ button that opens a row's menu (default: "Conversation actions") */
    conversationActions?: string;
    /** The "Rename" item of a row's menu (default: "Rename") */
    renameConversation?: string;
    /** Accessible name of the inline input a rename opens (default: "Conversation title") */
    conversationTitle?: string;
    /** The "Pin" item of a row's menu (default: "Pin") */
    pinConversation?: string;
    /** The same item on a pinned row (default: "Unpin") */
    unpinConversation?: string;
    /**
     * The question asked before a delete (default: "Delete “{title}”?"). `{title}` is
     * replaced with the row's title; a delete is the one action of the menu that asks
     * first, because it is the one that cannot be undone.
     */
    deleteConversationConfirm?: string;
    /** The button that declines that question (default: "Cancel") */
    cancel?: string;
    /** Heading of the pinned rows, which come first (default: "Pinned") */
    conversationGroupPinned?: string;
    /** Heading of the rows updated today (default: "Today") */
    conversationGroupToday?: string;
    /** … yesterday (default: "Yesterday") */
    conversationGroupYesterday?: string;
    /** … in the seven days before that (default: "Previous 7 days") */
    conversationGroupWeek?: string;
    /** … in the thirty days before that (default: "Previous 30 days"). Older rows are headed by their month, formatted with `tag`. */
    conversationGroupMonth?: string;

    // --- Scroll rail ---
    /** Accessible name of `<aparte-scroll-rail>`, the ticks beside the transcript (default: "Conversation outline") */
    scrollRailLabel?: string;
    /** Accessible name of `<aparte-sidebar>` (default: "Conversations") */
    sidebarLabel?: string;
    /** Accessible name of the seam between a split's two panes (default: "Resize the panes") */
    splitHandleLabel?: string;
    /**
     * Accessible name of the transcript itself (default: "Transcript").
     *
     * The scroll surface is a tab stop, because in WebKit a scrollable region that is
     * not focusable cannot be scrolled from the keyboard at all. A tab stop with no
     * name is announced as "group", so the name ships with the tab stop, not after it.
     */
    transcript?: string;

    // --- Elicitation (the panel a tool's question is asked in) ---
    /** The free-text fallback option in a choice (default: "Other…") */
    elicitationOther?: string;
    /** Placeholder of the free-text input that option reveals (default: "Type your answer…") */
    elicitationOtherPlaceholder?: string;
    /** Accessible name of that input, which has no visible label (default: "Custom answer") */
    elicitationOtherLabel?: string;
    /**
     * The send button while a question panel is open, where it submits an ANSWER
     * rather than sending a message (default: "Submit").
     *
     * The component has been reading this key since the panel API existed; it was
     * never declared, so `t()` returned "" and the hardcoded fallback showed. A key
     * read and never declared is worse than a literal: it looks translated.
     */
    submitButton?: string;
    /**
     * The cancel/stop button that replaces send while a turn is streaming
     * (default: "Stop").
     *
     * `aparte-composer-cancel` has been reading this key since it existed and it was
     * never declared — the same defect this file already records for `submitButton`
     * one entry up, found again while auditing a different question. So it has never
     * been translatable in ANY language, not even after a full reload: `t()` returned
     * nothing and the `|| 'Stop'` fallback rendered every time.
     *
     * The button carries no visible text — this string is its `aria-label` and its
     * `title`. Which is exactly why the gap survived: nothing on screen was in the
     * wrong language, so only a screen-reader user or someone hovering would ever
     * have met it. Most of the composer's translatable surface is like this.
     */
    stopButton?: string;
    /**
     * The tag a `recommended` option wears beside its label (default: "Recommended").
     * Said, not only tinted: a tint is a hint the eye may miss and a screen reader
     * never gets.
     *
     * (`elicitationNext` lived here until 2026-08-28, for the composer's button while a
     * form had questions ahead. That meaning is gone with the button's "advance" mode
     * — the chips are the navigation — so the key went with it, not deprecated.)
     */
    elicitationRecommended?: string;
    /**
     * The affordance that declines the request (default: "Skip").
     *
     * "Skip" reads as "skip THIS one" on a form of several questions, while it
     * declines the whole request — including questions already answered. That is MCP's
     * `decline` and the right behaviour. It was briefly renamed to carry the warning;
     * reverted, because the RECEIPT now shows the outcome unambiguously (one declined
     * row, no question attached), so the label no longer has to do that work — and
     * "Skip" is the short conventional word for it.
     */
    elicitationSkip?: string;
    /** Affirmative choice of a yes/no question (default: "Yes") */
    elicitationYes?: string;
    /** Negative choice of a yes/no question (default: "No") */
    elicitationNo?: string;
    /** Last-resort accessible name for a free-text answer (default: "Your answer") */
    elicitationAnswerLabel?: string;
    /**
     * Placeholder for the free-text arm of an approval (default: "Or tell it what to
     * do instead…").
     *
     * The refusal's REASON, in the user's words, which the model now reads because a
     * refusal hands it a turn. Before that this text had nowhere to go.
     */
    approvalInstructionPlaceholder?: string;
    /**
     * The question an approval asks (default: "Run {tool}?").
     *
     * `{tool}` is replaced with the tool's name. A placeholder rather than three
     * concatenated fragments, because word order is the first thing a translation
     * changes and "Run" + name + "?" only works in English.
     */
    approvalAsk?: string;
    /**
     * Accessible name of the viewport's scroll-to-bottom button (default:
     * "Scroll to bottom").
     *
     * It was hardcoded English at both sites that build the button — the one
     * chrome string a screen-reader user in another language always met. Same
     * class of defect as the undeclared-key trio (submitButton, stopButton,
     * actionUpload): the component looked done, the locale looked complete.
     */
    scrollToBottom?: string;
    /**
     * Accessible name of the `<aparte-suggestions>` group of prompt starters. Optional
     * for the same reason as the keys above: a locale written before the element existed
     * keeps working, and the built-in English fills the gap.
     */
    suggestionsLabel?: string;
    /** Accessible name of the `<aparte-context>` gauge. Optional, like the keys above. */
    contextLabel?: string;
    /**
     * Title line of the summary message `@aparte/plugin-compaction` injects in place
     * of the summarised turns (default: "Conversation summary"). The plugin reads it
     * through `config.t()`, so the notice follows the locale like every other string
     * the user reads — it used to be hardcoded, with an emoji, so a French chat
     * compacted into an English header.
     */
    compactionSummaryTitle?: string;
    /**
     * What the pill says while the decision is being made elsewhere (default:
     * "waiting for you").
     *
     * The pill is the anchor, not the control — so it has to say WHY nothing is
     * happening. A pill that just sits there while the answer is expected at the
     * composer is the one thing this placement can get wrong.
     */
    approvalWaiting?: string;
    /**
     * The words in a tool call's state badge.
     *
     * A WORD and not only a glyph, which is what every current implementation shows
     * ("Pending", "Running", "Completed", "Error"). A bare cross beside a name reads as
     * a button that removes something — the state was being mistaken for an
     * affordance, which is ratified decision #8 read backwards.
     */
    toolRunning?: string;
    toolCompleted?: string;
    toolRejected?: string;
    toolStopped?: string;
    /** The tool row's word when the handler threw — a crash, not a refusal nor a stop (default: "Failed"). */
    toolFailed?: string;
    /** Label above a tool call's arguments (default: "Input") */
    toolInput?: string;
    /** Label above a tool call's result (default: "Output") */
    toolOutput?: string;
    /** Accessible name for the group of approval options (default: "Your decision") */
    approvalOptionsLabel?: string;
    /**
     * Heading over the call's arguments in the approval panel (default: "Arguments").
     *
     * The panel named the tool and nothing else, while the arguments — the thing
     * actually being approved — stayed in the transcript row behind a closed
     * disclosure. Same word family as {@link toolInput} and deliberately not that
     * key: that one heads a section of a transcript row, this one heads a decision.
     */
    approvalArgsLabel?: string;

    /**
     * The composer's attach-file button (default: "Attach file").
     *
     * `aparte-composer-add-attachment` has been READING `t('actionUpload')` since it
     * existed, and the key was never declared — so `t()` returned '' and the
     * `|| 'Attach file'` fallback rendered in every language, after every reload.
     * The third instance of this exact defect in this file, after `submitButton` and
     * `stopButton`, and the one a user reported from the live language switcher.
     *
     * A key that is read and not declared cannot be found by reading either side: the
     * component looks correct, the locale looks complete. Cross-checking the two
     * lists is what finds them — `t()` calls and `getLocale().x` reads on one side,
     * these declarations on the other.
     */
    actionUpload?: string;
    /**
     * The ✕ on a pending attachment, named after the file it drops (default:
     * "Remove {name}").
     *
     * `{name}` is substituted with the file's own name — the convention
     * `approvalAsk` and `deleteConversationConfirm` already use. The button is
     * icon-only, so this string is the whole of what a screen-reader user hears.
     */
    removeAttachment?: string;

    // --- The searchable <aparte-select>, the primitive the model selector wears ---
    /**
     * Placeholder of a searchable select's filter field (default: "Search…").
     *
     * VISIBLE text, which is what separates it from most of this file: it was a
     * literal in the primitive, so a French page opened the model picker and read
     * "Search..." in the box.
     */
    selectSearchPlaceholder?: string;
    /** Accessible name of that filter field, which has no visible label (default: "Search options") */
    selectSearchLabel?: string;

    // --- Plugin chrome — read by `@aparte/plugin-model-selector` and
    // `@aparte/plugin-approval`, declared here for the same reason as the Artifacts
    // block below: a locale package translates one bag, not one per plugin. Both have
    // shipped in `APARTE_DEFAULT_LOCALE` and in `@aparte/locale-fr` since they existed
    // — only the declaration was missing, so a locale author met them through the index
    // signature alone, with no type and no JSDoc. ---
    /**
     * The `<aparte-model-selector>` trigger before a model is picked (default:
     * "Select a model..."). The one string that element takes from the locale.
     */
    modelSelectorPlaceholder?: string;
    /**
     * Accessible name of `@aparte/plugin-approval`'s mode switch (default: "Approval
     * mode"). The switch is an `<aparte-select>` with no visible label, so this string
     * is the whole of what a screen-reader user hears there.
     */
    approvalModeLabel?: string;

    // --- Artifacts — read by `@aparte/plugin-artifacts`, which draws the card. The
    // strings stay here because the locale is data every package shares (the
    // approval and ask-user plugins' keys live here too), and a locale package
    // translates one bag, not one per plugin. ---
    /**
     * The artifact card's download button (default: "Download").
     *
     * Like `stopButton`, this string is a `title` and an `aria-label` on an
     * icon-only button — which is why it stayed English through every locale this
     * project shipped. Nothing on screen was in the wrong language.
     */
    download?: string;
    /**
     * The artifact card's two tabs (defaults: "Preview" / "Code").
     *
     * These two ARE visible text, on a card the landing page leads with, and they
     * were still literals. The card was written before the locale had a home for
     * anything but chrome.
     */
    preview?: string;
    code?: string;
    /**
     * A binary artifact being produced, and the same artifact's preview being rebuilt
     * after a reload (defaults: "Generating…" / "Rebuilding preview…").
     *
     * `generating` was also the `aria-label` of the former `pipeline-waiting` segment, which
     * is the ONLY thing a screen-reader user hears while a turn is in flight. It was
     * hardcoded, so that announcement was English in every locale.
     */
    generating?: string;
    rebuildingPreview?: string;
    /**
     * What the preview pane says before anybody presses Preview (default: "Press
     * Preview to run this artifact.").
     *
     * The pane is empty on purpose — a previewable artifact is model-authored code
     * and mounting it unasked would execute it (ratified decision #8) — so this
     * sentence is the whole of what the reader sees there, and it was a literal.
     */
    previewPending?: string;
    /**
     * A binary artifact whose sandbox run failed: the heading, and the hint under it
     * (defaults: "The sandbox failed during generation." / "Common cause: …").
     *
     * The message BETWEEN them is the sandbox's own error text and stays untranslated
     * on purpose — it is the tool's output, not the library's copy.
     */
    sandboxError?: string;
    sandboxErrorHint?: string;

    // --- Metadata ---
    /**
     * BCP-47 language tag for `Intl` formatting — `'fr-FR'`, `'ja-JP'`, `'en-US'`.
     *
     * A locale is otherwise a bag of STRINGS, and a clock is not a string: it is a
     * format. So `setLocale(fr)` moved fifty strings and left the timestamp above
     * every message reading `7:32 PM`, because the only `Intl` call in the library
     * passed `undefined` — "use the BROWSER's locale" — which is not the locale the
     * app just chose. French is 24-hour; the browser was not asked.
     *
     * A tag and NOT an `hour12` flag, deliberately. A flag answers one question for
     * one call site; a tag answers every question `Intl` can be asked — hour cycle,
     * date order, month names, decimal separator, relative time, list joining — for
     * every locale, including the ones nobody here can enumerate. `direction` next
     * door is the precedent: this section holds how a language BEHAVES, not what its
     * words are.
     *
     * Undefined on purpose in the English default: `undefined` means "follow the
     * browser", which is the right default for a library and the behaviour every
     * consumer has today. A locale that declares a tag pins the formatting — if you
     * have chosen French strings, French formatting is what you meant.
     */
    tag?: string;
    /** Direction of the text (ltr or rtl) - defaults to ltr */
    direction?: 'ltr' | 'rtl';
};

/**
 * The extension half: any other key a plugin or an app wants to carry.
 *
 * This used to be an index signature ON `AparteLocale` — `[key: string]: string |
 * undefined` — and it silently disabled the only compile-time check the locale had.
 * `AparteConfig.t(key: keyof AparteLocale)` looks airtight; with an index signature,
 * `keyof` widens to `string` and EVERY literal typechecks. A renamed key
 * (`t('copy')` typed as `t('copyCodeBlock')`) compiled clean, `t()` returned `''`
 * at runtime, and the UI rendered an empty label with no error and no warning. It was
 * one of the six deliberate mistakes an audit planted, and the only guard that could
 * have caught it was this type.
 *
 * So the two halves are separate now: {@link AparteLocale} is CLOSED — it is the list
 * `t()` keys on — and this is the open bag beside it. {@link AparteConfig.setLocale}
 * and {@link AparteConfig.extendLocale} accept the intersection, so a plugin still
 * ships its own strings in the same object; only `t()` stays narrow, which is where
 * the typo has to be caught.
 */
export type AparteLocaleExtensions = Record<string, string | undefined>;

/**
 * Default English Locale (Zero-dependency)
 * Hardcoded to ensure the core works out-of-the-box.
 */
export const APARTE_DEFAULT_LOCALE: AparteLocale = {
    inputPlaceholder: "Type a message...",
    sendButton: "Send",
    copy: "Copy",
    copied: "Copied!",
    retry: "Retry",
    thinking: "Thinking...",
    elicitationOther: "Other…",
    elicitationOtherPlaceholder: "Type your answer…",
    elicitationOtherLabel: "Custom answer",
    submitButton: "Submit",
    stopButton: "Stop",
    elicitationRecommended: "Recommended",
    elicitationSkip: "Skip",
    elicitationYes: "Yes",
    elicitationNo: "No",
    elicitationAnswerLabel: "Your answer",
    approvalInstructionPlaceholder: "Or tell it what to do instead…",
    approvalAsk: "Run {tool}?",
    approvalWaiting: "waiting for you",
    scrollToBottom: "Scroll to bottom",
    suggestionsLabel: "Suggested prompts",
    contextLabel: "Context window",
    compactionSummaryTitle: "Conversation summary",
    toolRunning: "Running",
    toolCompleted: "Done",
    toolRejected: "Rejected",
    toolStopped: "Stopped",
    toolFailed: "Failed",
    toolInput: "Input",
    toolOutput: "Output",
    approvalOptionsLabel: "Your decision",
    approvalArgsLabel: "Arguments",
    actionUpload: "Attach file",
    removeAttachment: "Remove {name}",
    selectSearchPlaceholder: "Search…",
    selectSearchLabel: "Search options",
    download: "Download",
    previewPending: "Press Preview to run this artifact.",
    sandboxError: "The sandbox failed during generation.",
    sandboxErrorHint: "Common cause: the model produced invalid code (undefined variable, wrong argument type). Retry the request — the model may produce different code.",
    preview: "Preview",
    code: "Code",
    generating: "Generating…",
    rebuildingPreview: "Rebuilding preview…",
    typing: "Typing...",
    error: "Error",
    running: "Running...",
    run: "Run",
    file: "File",
    modelSelectorPlaceholder: "Select a model...",
    approvalModeLabel: "Approval mode",
    roleNameUser: "You",
    roleNameAssistant: "Assistant",
    yourMessage: "Your message",
    assistantResponse: "Assistant response",
    messageActions: "Message actions",
    edit: "Edit message",
    editConfirm: "Send",
    editCancel: "Cancel",
    feedbackPositive: "Good response",
    feedbackNegative: "Bad response",
    previousResponse: "Previous response",
    nextResponse: "Next response",
    approveTool: "Approve",
    rejectTool: "Reject",
    messageInfo: "Details",
    newChat: "New Chat",
    deleteConversation: "Delete",
    archiveConversation: "Archive",
    unarchiveConversation: "Unarchive",
    conversationActions: "Conversation actions",
    renameConversation: "Rename",
    conversationTitle: "Conversation title",
    pinConversation: "Pin",
    unpinConversation: "Unpin",
    deleteConversationConfirm: "Delete “{title}”?",
    cancel: "Cancel",
    conversationGroupPinned: "Pinned",
    conversationGroupToday: "Today",
    conversationGroupYesterday: "Yesterday",
    conversationGroupWeek: "Previous 7 days",
    conversationGroupMonth: "Previous 30 days",
    scrollRailLabel: "Conversation outline",
    sidebarLabel: "Conversations",
    splitHandleLabel: "Resize the panes",
    transcript: "Transcript",
    direction: 'ltr'
};
