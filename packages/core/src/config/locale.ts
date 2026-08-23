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
    elicitationNext: "Next",
    elicitationSkip: "Skip",
    elicitationYes: "Yes",
    elicitationNo: "No",
    elicitationAnswerLabel: "Your answer",
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
