/**
 * Every translatable string core itself renders — the CLOSED list.
 *
 * Core keeps only the English default in memory (`APARTE_DEFAULT_LOCALE`); other
 * languages arrive through `aparteGlobalConfig.setLocale()`.
 *
 * Closed, and an alias rather than an interface, on purpose. It has no index
 * signature: `AparteConfig.t(key: keyof AparteLocale)` is only checked at compile time
 * while `keyof` stays a union of literals, and an index signature would widen it to
 * `string` so that EVERY literal typechecks. A misspelled key would then compile, `t()`
 * would return `''` at runtime, and the UI would render an empty label with no error.
 *
 * The open half is {@link AparteLocaleExtensions}, and an ALIAS is what lets the two
 * meet: TypeScript gives a type alias an implicit index signature and an interface
 * none, so only this form is assignable to the extensions record that
 * `setLocale`/`extendLocale` accept and `getLocale` returns.
 *
 * Eleven keys here are rendered by no core file — the artifact card's six, its two
 * sandbox lines, the compaction summary's title, the approval mode picker's label and the
 * model selector's placeholder, all drawn by a plugin. They belong in this bag anyway: the
 * locale is one flat object every package shares, so a translator fills one record and
 * `@aparte/locale-fr` needs no companion per plugin. They are the
 * exception rather than the pattern, though, and a closed one: a plugin of your own
 * reads its strings off `getLocale()` and defaults them at the call site (the
 * localization guide shows it), and `check:locale-keys` holds those eleven in
 * `PLUGIN_OWNED` and refuses a twelfth. The reason is that a key here is a published name
 * before it is a word: it ships in every locale package, and the frozen surface then
 * keeps it for two releases.
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
    /** The label of a reasoning block, live or settled (default: "Thinking") */
    thinking: string;
    /** What the status line says while a reply is being written, when it carries no `text` (default: "Typing") */
    typing: string;
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
    /** Read by a screen reader while the conversation list is on its way (default: "Loading conversations") */
    loadingConversations: string;
    /** The conversation list's line when its filter matches no title (default: "No conversation matches") */
    conversationSearchEmpty?: string;
    /** Accessible name of the conversation list, a navigation landmark (default: "Conversations") */
    conversationList?: string;
    /** Read by a screen reader while a conversation's messages are on their way (default: "Loading the conversation") */
    loadingConversation: string;
    /**
     * The "Delete" item of a row's menu (default: "Delete"). The menu is named after
     * the row, so the item carries only the verb.
     */
    deleteConversation: string;
    /** The "Archive" item of a row's menu (default: "Archive") */
    archiveConversation?: string;
    /** The same item on an archived row (default: "Unarchive") */
    unarchiveConversation?: string;
    /** Accessible name of the ⋯ button that opens a row's menu (default: "Conversation actions") */
    conversationActions?: string;
    /** What a screen reader hears with a row whose conversation an AI is answering in (default: "Answering") */
    conversationRunning?: string;
    /** What a screen reader hears with a row whose turn waits for the person (default: "Waiting for you") */
    conversationWaiting?: string;
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
     */
    submitButton?: string;
    /**
     * The cancel/stop button that replaces send while a turn is streaming
     * (default: "Stop").
     *
     * The button carries no visible text — this string is its `aria-label` and its
     * `title`.
     */
    stopButton?: string;
    /**
     * The tag a `recommended` option wears beside its label (default: "Recommended").
     * Said, not only tinted: a tint is a hint the eye may miss and a screen reader
     * never gets.
     */
    elicitationRecommended?: string;
    /**
     * The affordance that declines the request (default: "Skip").
     *
     * "Skip" reads as "skip THIS one" on a form of several questions, while it
     * declines the whole request — including questions already answered. That is MCP's
     * `decline`. The receipt shows the outcome unambiguously (one declined row, no
     * question attached), so the label does not have to carry the warning and stays the
     * short conventional word.
     */
    elicitationSkip?: string;
    /** Label of the button that puts an open question or approval aside, to read the transcript behind it (default: "Hide for now") */
    elicitationHide?: string;
    /** The one-line bar an aside panel leaves, which brings it back (default: "Waiting for your answer") */
    elicitationWaiting?: string;
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
     * The refusal's REASON, in the user's words, which the model reads because a
     * refusal hands it a turn.
     */
    approvalInstructionPlaceholder?: string;
    /**
     * The question an approval asks (default: "Allow {tool}?").
     *
     * `{tool}` is replaced with the call as its row names it: the tool's label when the
     * app declared one (`registerToolDisplay`), else its identifier, then what the call
     * targets. "Allow" reads with either — "Run" read a label that is an action twice
     * ("Run Run command…"). A placeholder rather than three concatenated fragments,
     * because word order is the first thing a translation changes.
     */
    approvalAsk?: string;
    /**
     * Accessible name of the viewport's scroll-to-bottom button (default:
     * "Scroll to bottom").
     *
     * The button is icon-only, so this string is the whole of what a screen-reader
     * user hears there.
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
     * the user reads.
     */
    compactionSummaryTitle?: string;
    /**
     * What the pill says while the decision is being made elsewhere (default:
     * "Waiting").
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
     * a button that removes something: a state must not be mistaken for an
     * affordance.
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
    /**
     * The note after a refused call's state word, quoting what the person typed instead
     * (default: "You said: “{instruction}”"). The model reads its own sentence; this is
     * the person's words given back to them.
     */
    toolRejectedSaid?: string;
    /** The note on a call an approval policy refused, not a person (default: "Refused by policy"). */
    toolRefusedByPolicy?: string;
    /** The note on a call not run because an earlier call of the same step was refused (default: "Not run: an earlier call was refused"). */
    toolNotRunAfterRefusal?: string;
    /** The note on a call whose handler outlived its timeout (default: "Timed out"). */
    toolTimedOut?: string;
    /** The note on a call nothing on this page can run — no handler for it (default: "Not available here"). */
    toolUnavailable?: string;
    /** The note on a call that needed an approval nobody could give — no approval channel (default: "No one could approve it"). */
    toolNoApprover?: string;
    /** The note on a call stopped by its tool's own turn limit (default: "Turn limit reached"). */
    toolTurnLimit?: string;
    /**
     * The error a turn ends on when the loop reaches `maxTurns`; `{n}` is the limit
     * (default: "Stopped after {n} turns to avoid an endless loop.").
     */
    maxTurnsReached?: string;
    /**
     * `@aparte/plugin-ask-user`: the receipt's line when the person declined to answer
     * (default: "You declined to answer."). The model reads `ASK_USER_DECLINED`, its own
     * sentence; this is the person's.
     */
    questionDeclined?: string;
    /** `@aparte/plugin-artifacts`: a `create_artifact` call that was refused, stopped or failed (default: "Not created"). */
    artifactNotCreated?: string;
    /**
     * A settled reasoning block's label when the app shows durations (`showDuration`)
     * (default: "Thought for {duration}"). `{duration}` is formatted by `Intl` in the
     * locale's `tag`: "8s", "1m 12s".
     */
    thoughtFor?: string;
    /** A settled reasoning block's label (default: "Thought") — and with `showDuration`, when no timing came with it. */
    thought?: string;
    /** Accessible name for the group of approval options (default: "Your decision") */
    approvalOptionsLabel?: string;
    /**
     * Heading over the call's arguments in the approval panel (default: "Arguments").
     *
     * The arguments are the thing actually being approved, so the panel shows them
     * under this heading. Same word family as {@link toolInput} and deliberately not
     * that key: that one heads a section of a transcript row, this one heads a
     * decision.
     */
    approvalArgsLabel?: string;

    /**
     * The composer's attach-file button (default: "Attach file").
     *
     * Read by `aparte-composer-add-attachment` as `t('actionUpload')`.
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
    /**
     * The accessible name of a message whose bubble carries a `name` — a human agent, a
     * second assistant (default: "Message from {name}"). `{name}` is that name. Without one
     * the bubble is named after its role: `yourMessage` or `assistantResponse`.
     */
    messageFrom?: string;

    // --- The searchable <aparte-select>, the primitive the model selector wears ---
    /**
     * Placeholder of a searchable select's filter field (default: "Search…").
     *
     * VISIBLE text, which is what separates it from most of this file.
     */
    selectSearchPlaceholder?: string;
    /** Accessible name of that filter field, which has no visible label (default: "Search options") */
    selectSearchLabel?: string;
    /** What an option group shows while its options are being fetched (default: "Loading…") */
    loading?: string;

    // --- Plugin chrome — read by `@aparte/plugin-model-selector` and
    // `@aparte/plugin-approval`, declared here for the same reason as the Artifacts
    // block below: a locale package translates one bag, not one per plugin. ---
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
     * icon-only button.
     */
    download?: string;
    /** The artifact card's Open button, when the app asked for it (default: "Open") */
    openArtifact?: string;
    /** A model's context window under its name in the model selector's `details` — `{n}` is the size (default: "{n} context") */
    modelContextWindow?: string;
    /**
     * The artifact card's two tabs (defaults: "Preview" / "Code").
     *
     * These two are visible text on the card.
     */
    preview?: string;
    code?: string;
    /**
     * A binary artifact being produced, and the same artifact's preview being rebuilt
     * after a reload (defaults: "Generating…" / "Rebuilding preview…").
     *
     * Both are read by `@aparte/plugin-artifacts`: `generating` is the subtext of a binary
     * artifact being produced and the `aria-label` of the artifact card's streaming pulse.
     */
    generating?: string;
    rebuildingPreview?: string;
    /**
     * What the preview pane says before anybody presses Preview (default: "Press
     * Preview to run this artifact.").
     *
     * The pane is empty on purpose — a previewable artifact is model-authored code
     * and mounting it unasked would execute it — so this sentence is the whole of
     * what the reader sees there.
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
     * format. The tag is what the library's `Intl` calls (the timestamp above every
     * message) use, instead of the BROWSER's locale, which is not necessarily the
     * locale the app chose.
     *
     * A tag and NOT an `hour12` flag, deliberately. A flag answers one question for
     * one call site; a tag answers every question `Intl` can be asked — hour cycle,
     * date order, month names, decimal separator, relative time, list joining — for
     * every locale, including the ones nobody here can enumerate. `direction` next
     * door is the precedent: this section holds how a language BEHAVES, not what its
     * words are.
     *
     * Undefined on purpose in the English default: `undefined` means "follow the
     * browser", which is the right default for a library. A locale that declares a tag pins the formatting — if you
     * have chosen French strings, French formatting is what you meant.
     */
    tag?: string;
    /**
     * Reading direction — `'ltr'` or `'rtl'`. Written as `dir` onto the viewport's
     * scroll container and onto `<aparte-composer>`, so everything inside inherits it.
     *
     * Undefined on purpose in the English default, for the reason `tag` above is:
     * `undefined` means "follow the host": core writes no `dir` of its own, so the
     * host's direction (`<html dir="rtl">`) inherits, which is what a library should
     * do with a decision the page has already taken.
     *
     * A locale that wants the direction PINNED still declares it, and that is the
     * case it exists for: `@aparte/locale-ar` would say `'rtl'` whatever the page
     * around it does. `setLocale` replaces the object wholesale, so nothing merges a
     * default back in.
     */
    direction?: 'ltr' | 'rtl';
};

/**
 * The extension half: any other key a plugin or an app wants to carry.
 *
 * Kept separate from {@link AparteLocale} on purpose: an index signature on
 * `AparteLocale` itself would widen `keyof AparteLocale` to `string`, so `t()` would
 * typecheck every literal and a misspelled key would render an empty label with no
 * error.
 *
 * The two halves: {@link AparteLocale} is CLOSED — it is the list
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
    thinking: "Thinking",
    elicitationOther: "Other…",
    elicitationOtherPlaceholder: "Type your answer…",
    elicitationOtherLabel: "Custom answer",
    submitButton: "Submit",
    stopButton: "Stop",
    elicitationRecommended: "Recommended",
    elicitationSkip: "Skip",
    elicitationHide: "Hide for now",
    elicitationWaiting: "Waiting for your answer",
    elicitationYes: "Yes",
    elicitationNo: "No",
    elicitationAnswerLabel: "Your answer",
    approvalInstructionPlaceholder: "Or tell it what to do instead…",
    approvalAsk: "Allow {tool}?",
    approvalWaiting: "Waiting",
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
    toolRejectedSaid: "You said: “{instruction}”",
    toolRefusedByPolicy: "Refused by policy",
    toolNotRunAfterRefusal: "Not run: an earlier call was refused",
    toolTimedOut: "Timed out",
    toolUnavailable: "Not available here",
    toolNoApprover: "No one could approve it",
    toolTurnLimit: "Turn limit reached",
    maxTurnsReached: "Stopped after {n} turns to avoid an endless loop.",
    questionDeclined: "You declined to answer.",
    artifactNotCreated: "Not created",
    thoughtFor: "Thought for {duration}",
    thought: "Thought",
    approvalOptionsLabel: "Your decision",
    approvalArgsLabel: "Arguments",
    actionUpload: "Attach file",
    removeAttachment: "Remove {name}",
    messageFrom: "Message from {name}",
    selectSearchPlaceholder: "Search…",
    selectSearchLabel: "Search options",
    loading: "Loading…",
    download: "Download",
    openArtifact: "Open",
    modelContextWindow: "{n} context",
    previewPending: "Press Preview to run this artifact.",
    sandboxError: "The sandbox failed during generation.",
    sandboxErrorHint: "Common cause: the model produced invalid code (undefined variable, wrong argument type). Retry the request — the model may produce different code.",
    preview: "Preview",
    code: "Code",
    generating: "Generating…",
    rebuildingPreview: "Rebuilding preview…",
    typing: "Typing",
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
    loadingConversations: "Loading conversations",
    conversationSearchEmpty: "No conversation matches",
    conversationList: "Conversations",
    loadingConversation: "Loading the conversation",
    deleteConversation: "Delete",
    archiveConversation: "Archive",
    unarchiveConversation: "Unarchive",
    conversationActions: "Conversation actions",
    conversationRunning: "Answering",
    conversationWaiting: "Waiting for you",
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
    transcript: "Transcript"
};
