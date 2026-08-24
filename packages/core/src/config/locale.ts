/**
 * Aparte Locale Interface
 *
 * Defines all translatable strings for the chat interface.
 * The core keeps only the English default in memory.
 * Other languages are injected via aparteGlobalConfig.setLocale().
 */

export interface AparteLocale {
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
    /** Short suffix for tokens-per-second perf chip (default: "tok/s") */
    tokensPerSecondLabel?: string;
    /** Aria-label / tooltip for the message info ("i") action button (default: "Details") */
    messageInfo?: string;

    // --- Conversation list ---
    /** Default title for a new conversation (default: "New Chat") */
    newChat: string;
    /** Aria-label for the delete conversation button (default: "Delete conversation") */
    deleteConversation: string;
    /** Aria-label for the archive conversation button (default: "Archive conversation") */
    archiveConversation?: string;
    /** Aria-label for the unarchive conversation button (default: "Unarchive conversation") */
    unarchiveConversation?: string;

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
     * The send button while a form of several questions has more ahead — it advances
     * instead of submitting (default: "Next").
     *
     * This key existed briefly for a Next button inside the panel, and went when that
     * button did. It comes back because the MEANING came back, on a different element:
     * the composer's one button, which is where it belonged.
     */
    elicitationNext?: string;
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

    // --- Artifacts ---
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
     * `generating` is also the `aria-label` of the `pipeline-waiting` segment, which
     * is the ONLY thing a screen-reader user hears while a turn is in flight. It was
     * hardcoded, so that announcement was English in every locale.
     */
    generating?: string;
    rebuildingPreview?: string;

    // --- Metadata ---
    /** Direction of the text (ltr or rtl) - defaults to ltr */
    direction?: 'ltr' | 'rtl';

    /** Allow extensions for plugins */
    [key: string]: string | undefined;
}

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
    elicitationNext: "Next",
    elicitationSkip: "Skip",
    elicitationYes: "Yes",
    elicitationNo: "No",
    elicitationAnswerLabel: "Your answer",
    download: "Download",
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
    tokensPerSecondLabel: "tok/s",
    messageInfo: "Details",
    newChat: "New Chat",
    deleteConversation: "Delete conversation",
    archiveConversation: "Archive conversation",
    unarchiveConversation: "Unarchive conversation",
    direction: 'ltr'
};
