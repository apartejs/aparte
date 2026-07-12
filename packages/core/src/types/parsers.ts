/**
 * Aparte Parsers
 * Interfaces for content parsing plugins
 */

// ─────────────────────────────────────────────────────────────────────────────
// Content Parser Plugin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Content parser plugin interface for external parsers
 * Allows integration of Markdown, code highlighting, LaTeX, etc.
 * without adding dependencies to the core
 */
export interface AparteContentParser {
    /** Unique identifier for the parser */
    id: string;

    /** Priority for parser execution (higher = first) */
    priority: number;

    /**
     * Check if this parser can handle the content
     * @param content - Raw content to check
     * @returns true if parser should process this content
     */
    canParse(content: string): boolean;

    /**
     * Parse content and return transformed output
     * @param content - Raw content to parse
     * @returns Parsed HTML string or transformed content
     */
    parse(content: string): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parser registry interface for managing multiple parsers
 * Optional interface for advanced parser management
 */
export interface AparteParserRegistry {
    /** Register a new parser */
    register(parser: AparteContentParser): void;

    /** Unregister a parser by ID */
    unregister(parserId: string): void;

    /** Get all registered parsers */
    getAll(): readonly AparteContentParser[];

    /** Parse content through all applicable parsers */
    parse(content: string): string;
}
