/**
 * Aparte Providers
 * Abstract interfaces for data providers and adapters
 */

import type { AparteMessage, AparteStatus } from './models.js';
import type { AparteControlEvent } from './events.js';

// ─────────────────────────────────────────────────────────────────────────────
// Data Provider Abstraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Abstract data provider interface
 * Allows the viewport to receive data from any source
 * (Fetch, WebSocket, Mock, or custom implementations)
 * 
 * @example
 * ```typescript
 * class WebSocketProvider implements AparteDataProvider {
 *   request(payload: unknown): void {
 *     this.socket.send(JSON.stringify(payload));
 *   }
 * }
 * ```
 */
export interface AparteDataProvider {
    /**
     * Send a request to the data source
     * Implementation-agnostic method signature
     * 
     * @param payload - Request payload (message, config, etc.)
     */
    request(payload: unknown): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming Provider
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extended provider interface for streaming responses
 * Adds lifecycle hooks for stream management
 */
export interface AparteStreamProvider extends AparteDataProvider {
    /**
     * Optional: Called when streaming starts
     * @param messageId - ID of the message being streamed
     */
    onStreamStart?(messageId: string): void;

    /**
     * Optional: Called for each token received
     * @param messageId - ID of the message
     * @param chunk - Token chunk content
     */
    onToken?(messageId: string, chunk: string): void;

    /**
     * Optional: Called when streaming completes
     * @param messageId - ID of the completed message
     */
    onStreamEnd?(messageId: string): void;

    /**
     * Optional: Called on error
     * @param messageId - ID of the affected message
     * @param error - Error details
     */
    onError?(messageId: string, error: unknown): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Store Abstraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Abstract message store interface
 * Allows custom storage implementations (memory, IndexedDB, etc.)
 */
export interface AparteMessageStore {
    /** Get a message by ID */
    get(messageId: string): AparteMessage | undefined;

    /** Get all messages */
    getAll(): AparteMessage[];

    /** Add or update a message */
    set(message: AparteMessage): void;

    /** Remove a message by ID */
    delete(messageId: string): boolean;

    /** Clear all messages */
    clear(): void;

    /** Get message count */
    size(): number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Control Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface for handling control events from external packages
 * Allows decoupled communication between packages
 */
export interface AparteControlHandler {
    /**
     * Handle a control event
     * @param event - Control event to process
     */
    handleControl(event: AparteControlEvent): void;

    /**
     * Update message status
     * @param messageId - Target message ID
     * @param status - New status
     */
    updateStatus(messageId: string, status: AparteStatus): void;
}
