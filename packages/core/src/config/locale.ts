/**
 * Aparte Locale Interface
 *
 * Defines all translatable strings for the chat interface.
 * The core keeps only the English default in memory.
 * Other languages are injected via AparteConfig.setLocale().
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
export const DEFAULT_LOCALE: AparteLocale = {
    inputPlaceholder: "Type a message...",
    sendButton: "Send",
    copy: "Copy",
    copied: "Copied!",
    retry: "Retry",
    thinking: "Thinking...",
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
