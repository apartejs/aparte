/**
 * AparteStreamParser
 * 
 * Real-time markdown stream parser for AI/LLM responses.
 * Detects code blocks, thinking blocks, and other patterns during streaming.
 * 
 * Supported patterns:
 * - ```language\ncode\n``` → AparteCodeSegment
 * - Plain text → AparteTextSegment
 * - <think>…</think> or <thinking>…</thinking> → AparteThinkingSegment (configurable)
 */

import type {
    AparteSegment,
    AparteTextSegment,
    AparteCodeSegment,
    AparteThinkingSegment,
    AparteArtifactSegment,
} from '../types/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One inline thinking-block delimiter pair (open/close tag). */
export interface AparteThinkingDelimiterPair {
    start: string;
    end: string;
}

export interface AparteStreamParserOptions {
    /**
     * Inline thinking-block delimiters — for a model that streams its reasoning
     * *inline in the content* (rather than on a separate reasoning channel).
     * Accepts one pair or several; the parser opens a thinking segment at
     * whichever pair appears first. Default recognizes BOTH common conventions:
     * `<think>…</think>` (DeepSeek-R1, QwQ, most local GGUF reasoning models) and
     * `<thinking>…</thinking>` (Claude-style). Pass your own to override.
     */
    thinkingDelimiters?: AparteThinkingDelimiterPair | AparteThinkingDelimiterPair[];
    /** Auto-generate segment IDs (default: true) */
    autoGenerateIds?: boolean;
    /** ID prefix for generated segments */
    idPrefix?: string;
}

/** Recognized out of the box so local reasoning models "just work" (no config). */
const DEFAULT_THINKING_DELIMITERS: AparteThinkingDelimiterPair[] = [
    { start: '<think>', end: '</think>' },
    { start: '<thinking>', end: '</thinking>' },
];

export interface AparteParserState {
    /** Current parser mode */
    mode: 'text' | 'code' | 'thinking' | 'artifact';
    /** Buffer for incomplete patterns */
    buffer: string;
    /** Current code block language */
    codeLanguage?: string;
    /** Close delimiter of the thinking pair currently open (multi-delimiter support) */
    thinkingEnd?: string;
    /** Accumulated segments */
    segments: AparteSegment[];
    /** Current active segment being built */
    activeSegment: AparteSegment | null;
    /** Counter for generating IDs */
    segmentCounter: number;
}

export interface AparteParserResult {
    /** Parsed segments */
    segments: AparteSegment[];
    /** Remaining buffer (incomplete patterns) */
    remaining: string;
    /** Current parser state */
    state: AparteParserState;
}

// ─────────────────────────────────────────────────────────────────────────────
// AparteStreamParser Class
// ─────────────────────────────────────────────────────────────────────────────

export class AparteStreamParser {
    private _options: Required<Pick<AparteStreamParserOptions, 'autoGenerateIds' | 'idPrefix'>>;
    /** Normalized to an array; the parser matches whichever pair opens first. */
    private _thinkingDelimiters: AparteThinkingDelimiterPair[];
    private _state: AparteParserState;

    constructor(options: AparteStreamParserOptions = {}) {
        const delims = options.thinkingDelimiters;
        this._thinkingDelimiters = delims
            ? (Array.isArray(delims) ? delims : [delims])
            : DEFAULT_THINKING_DELIMITERS;
        this._options = {
            autoGenerateIds: options.autoGenerateIds ?? true,
            idPrefix: options.idPrefix ?? 'seg'
        };

        this._state = this._createInitialState();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Parse a chunk of streamed content
     * Call this for each chunk received from the LLM
     */
    parse(chunk: string): AparteParserResult {
        this._state.buffer += chunk;

        const completedSegments: AparteSegment[] = [];

        while (this._state.buffer.length > 0) {
            const parsed = this._parseNext();

            if (!parsed) {
                // No complete pattern found, keep buffer for next chunk
                break;
            }

            if (parsed.segment) {
                completedSegments.push(parsed.segment);
            }

            this._state.buffer = parsed.remaining;
        }

        return {
            segments: completedSegments,
            remaining: this._state.buffer,
            state: { ...this._state }
        };
    }

    /**
     * Finalize parsing - flush any remaining content as text
     */
    finalize(): AparteSegment[] {
        const finalSegments: AparteSegment[] = [];

        // An unwrapped ```markdown block leaves its trailing close fence in the
        // text stream — strip a dangling ``` so it never renders as a stray
        // empty code block at the very end of the reply.
        const stripTrailingFence = (s: string): string => s.replace(/\n?```[ \t]*$/, '');

        // If we have an active segment, complete it
        if (this._state.activeSegment) {
            if ('content' in this._state.activeSegment) {
                const seg = this._state.activeSegment as { type: string; content: string };
                let content = seg.content + this._state.buffer;
                if (seg.type === 'text') content = stripTrailingFence(content);
                seg.content = content;
            }
            finalSegments.push(this._state.activeSegment);
            this._state.activeSegment = null;
            this._state.buffer = '';
        } else if (this._state.buffer.trim()) {
            // Remaining buffer becomes text segment
            finalSegments.push(this._createTextSegment(stripTrailingFence(this._state.buffer)));
            this._state.buffer = '';
        }

        return finalSegments;
    }

    /**
     * Reset parser state
     */
    reset(): void {
        this._state = this._createInitialState();
    }

    /**
     * Get current parser state (for debugging/inspection)
     */
    getState(): Readonly<AparteParserState> {
        return { ...this._state };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private Parsing Logic
    // ─────────────────────────────────────────────────────────────────────────

    private _parseNext(): { segment: AparteSegment | null; remaining: string } | null {
        const buffer = this._state.buffer;

        switch (this._state.mode) {
            case 'text':
                return this._parseTextMode(buffer);
            case 'code':
                return this._parseCodeMode(buffer);
            case 'thinking':
                return this._parseThinkingMode(buffer);
            case 'artifact':
                return this._parseArtifactMode(buffer);
            default:
                return null;
        }
    }

    private _parseTextMode(buffer: string): { segment: AparteSegment | null; remaining: string } | null {
        // Check for code block start: ```
        const codeBlockStart = buffer.indexOf('```');

        // Check for thinking block start — earliest match across all recognized
        // delimiter pairs (e.g. <think> vs <thinking>).
        let thinkingStart = -1;
        for (const p of this._thinkingDelimiters) {
            const i = buffer.indexOf(p.start);
            if (i !== -1 && (thinkingStart === -1 || i < thinkingStart)) thinkingStart = i;
        }

        // Check for artifact block start: <artifact ...>
        const artifactStart = buffer.indexOf('<artifact');

        // Determine which pattern comes first
        const patterns: { type: 'code' | 'thinking' | 'artifact'; index: number }[] = [];
        if (codeBlockStart !== -1) patterns.push({ type: 'code', index: codeBlockStart });
        if (thinkingStart !== -1) patterns.push({ type: 'thinking', index: thinkingStart });
        if (artifactStart !== -1) patterns.push({ type: 'artifact', index: artifactStart });

        patterns.sort((a, b) => a.index - b.index);

        if (patterns.length === 0) {
            // No special patterns found
            // Check if buffer might be start of a pattern (keep it for next chunk)
            if (buffer.endsWith('`') || buffer.endsWith('``') ||
                this._thinkingDelimiters.some(p => this._isPartialMatch(buffer, p.start)) ||
                this._isPartialMatch(buffer, '<artifact')) {
                return null; // Keep buffer, wait for more data
            }

            // No pattern starting. Just accumulate text in active segment.
            if (!this._state.activeSegment || this._state.activeSegment.type !== 'text') {
                this._state.activeSegment = this._createTextSegment('');
            }

            (this._state.activeSegment as AparteTextSegment).content += buffer;
            return { segment: null, remaining: '' };
        }

        const firstPattern = patterns[0]!;

        // If pattern is NOT at index 0, accumulate the text before it
        if (firstPattern.index > 0) {
            const textContent = buffer.slice(0, firstPattern.index);
            if (!this._state.activeSegment || this._state.activeSegment.type !== 'text') {
                this._state.activeSegment = this._createTextSegment(textContent);
            } else {
                (this._state.activeSegment as AparteTextSegment).content += textContent;
            }
            // Return nothing yet, let the next loop handle the pattern at index 0
            return { segment: null, remaining: buffer.slice(firstPattern.index) };
        }

        // Pattern is at the start index 0. Finish current text segment if any.
        let segmentToEmit: AparteSegment | null = null;
        if (this._state.activeSegment && this._state.activeSegment.type === 'text') {
            segmentToEmit = this._state.activeSegment;
            this._state.activeSegment = null;
        }

        if (firstPattern.type === 'code') {
            const res = this._startCodeBlock(buffer);
            return res ? { segment: segmentToEmit, remaining: res.remaining } : null;
        } else if (firstPattern.type === 'thinking') {
            const res = this._startThinkingBlock(buffer);
            return res ? { segment: segmentToEmit, remaining: res.remaining } : null;
        } else {
            const res = this._startArtifactBlock(buffer);
            if (!res) {
                // Opening tag incomplete — restore the text segment we were about to emit
                if (segmentToEmit) this._state.activeSegment = segmentToEmit;
                return null;
            }
            return { segment: segmentToEmit, remaining: res.remaining };
        }
    }

    private _startCodeBlock(buffer: string): { segment: AparteSegment | null; remaining: string } | null {
        // Find the newline after ```language
        const firstNewline = buffer.indexOf('\n');

        if (firstNewline === -1) {
            return null; // Wait for language line to complete
        }

        const firstLine = buffer.slice(0, firstNewline);
        // Remove ``` and read the language tag ; a fence with no tag → 'markdown'.
        const language = firstLine.slice(3).trim() || 'markdown';

        // ```markdown / ```md (and a bare ``` → markdown) = the model wrapping
        // its whole reply as a "markdown document". Do NOT open a code block :
        //  (1) it would show raw source instead of a formatted reply ;
        //  (2) the inner ```bash / ```json sub-fences make _parseCodeMode close
        //      the outer block at the first one — shredding the reply into
        //      fragments (one stray code block per nested fence).
        // Instead, drop the fence line and keep parsing in `text` mode : the
        // inner fenced blocks then sit at top level and parse as real code
        // segments, and the whole thing renders as one coherent markdown reply.
        if (language === 'markdown' || language === 'md') {
            return { segment: null, remaining: buffer.slice(firstNewline + 1) };
        }

        this._state.mode = 'code';
        this._state.codeLanguage = language;
        this._state.activeSegment = this._createCodeSegment(language, '');

        return { segment: null, remaining: buffer.slice(firstNewline + 1) };
    }

    private _parseCodeMode(buffer: string): { segment: AparteSegment | null; remaining: string } | null {
        // Look for closing ```
        const closeIndex = buffer.indexOf('\n```');

        if (closeIndex === -1) {
            // Check for ``` at end without newline
            if (buffer.endsWith('```')) {
                const codeContent = buffer.slice(0, -3);
                if (this._state.activeSegment && 'content' in this._state.activeSegment) {
                    (this._state.activeSegment as { content: string }).content += codeContent;
                }
                const segment = this._state.activeSegment;
                this._state.mode = 'text';
                this._state.activeSegment = null;
                return { segment, remaining: '' };
            }

            // No closing found, accumulate content (keep last 4 chars as potential pattern)
            if (buffer.length > 4) {
                const safeContent = buffer.slice(0, -4);
                if (this._state.activeSegment && 'content' in this._state.activeSegment) {
                    (this._state.activeSegment as { content: string }).content += safeContent;
                }
                return { segment: null, remaining: buffer.slice(-4) };
            }
            return null;
        }

        // Found closing
        const codeContent = buffer.slice(0, closeIndex);
        if (this._state.activeSegment && 'content' in this._state.activeSegment) {
            (this._state.activeSegment as { content: string }).content += codeContent;
        }

        const segment = this._state.activeSegment;
        this._state.mode = 'text';
        this._state.activeSegment = null;

        // Skip past \n```
        const afterClose = buffer.slice(closeIndex + 4);
        // Also skip trailing newline if present
        const remaining = afterClose.startsWith('\n') ? afterClose.slice(1) : afterClose;

        return { segment, remaining };
    }

    private _startThinkingBlock(buffer: string): { segment: AparteSegment | null; remaining: string } | null {
        const pair = this._thinkingDelimiters.find(p => buffer.startsWith(p.start));
        if (!pair) {
            return null;
        }

        this._state.mode = 'thinking';
        // Remember which pair opened so the matching close delimiter is used.
        this._state.thinkingEnd = pair.end;
        this._state.activeSegment = this._createThinkingSegment('');

        return { segment: null, remaining: buffer.slice(pair.start.length) };
    }

    private _parseThinkingMode(buffer: string): { segment: AparteSegment | null; remaining: string } | null {
        const endDelim = this._state.thinkingEnd ?? this._thinkingDelimiters[0]!.end;
        const closeIndex = buffer.indexOf(endDelim);

        if (closeIndex === -1) {
            // Check for partial match at end
            if (this._isPartialMatch(buffer, endDelim)) {
                // Keep potential match in buffer
                const partialLength = this._getPartialMatchLength(buffer, endDelim);
                const safeContent = buffer.slice(0, buffer.length - partialLength);
                if (safeContent && this._state.activeSegment && 'content' in this._state.activeSegment) {
                    (this._state.activeSegment as { content: string }).content += safeContent;
                }
                // Whole buffer is a partial delimiter (nothing safe to emit yet):
                // return null so parse() keeps the buffer for the next chunk —
                // otherwise remaining === buffer spins parse()'s while-loop forever.
                return safeContent
                    ? { segment: null, remaining: buffer.slice(-partialLength) }
                    : null;
            }

            // No close, accumulate
            if (buffer.length > endDelim.length) {
                const safeContent = buffer.slice(0, -endDelim.length);
                if (this._state.activeSegment && 'content' in this._state.activeSegment) {
                    (this._state.activeSegment as { content: string }).content += safeContent;
                }
                return { segment: null, remaining: buffer.slice(-endDelim.length) };
            }
            return null;
        }

        // Found closing
        const thinkingContent = buffer.slice(0, closeIndex);
        if (this._state.activeSegment && 'content' in this._state.activeSegment) {
            (this._state.activeSegment as { content: string }).content += thinkingContent;
        }

        const segment = this._state.activeSegment;
        this._state.mode = 'text';
        this._state.activeSegment = null;
        this._state.thinkingEnd = undefined;

        return { segment, remaining: buffer.slice(closeIndex + endDelim.length) };
    }

    /**
     * Start an artifact block. Buffer must start with `<artifact`.
     * The full opening tag must be present (`>`); otherwise we return null and wait
     * for more chunks.
     *
     * Supported attributes (Anthropic-style, single or double quotes):
     *   - type   — required (MIME type, verbatim)
     *   - title  — optional human label
     *
     * Any other attributes are ignored gracefully.
     */
    private _startArtifactBlock(buffer: string): { segment: AparteSegment | null; remaining: string } | null {
        if (!buffer.startsWith('<artifact')) return null;

        const tagEnd = buffer.indexOf('>');
        if (tagEnd === -1) return null; // wait for more

        const tag = buffer.slice(0, tagEnd + 1);
        const inner = tag.slice('<artifact'.length, -1); // attributes string

        const typeMatch = inner.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
        const titleMatch = inner.match(/\btitle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);

        const mimeType = (typeMatch && (typeMatch[1] ?? typeMatch[2])) ?? 'text/plain';
        const title = titleMatch ? (titleMatch[1] ?? titleMatch[2]) : undefined;

        this._state.mode = 'artifact';
        this._state.activeSegment = this._createArtifactSegment(mimeType, title);

        return { segment: null, remaining: buffer.slice(tagEnd + 1) };
    }

    /**
     * Stream content into the active artifact segment until `</artifact>` is seen.
     * Mirrors `_parseThinkingMode` so partial matches at chunk boundaries don't
     * split the closing tag across two updates.
     */
    private _parseArtifactMode(buffer: string): { segment: AparteSegment | null; remaining: string } | null {
        const endDelim = '</artifact>';
        const closeIndex = buffer.indexOf(endDelim);

        if (closeIndex === -1) {
            if (this._isPartialMatch(buffer, endDelim)) {
                const partialLength = this._getPartialMatchLength(buffer, endDelim);
                const safeContent = buffer.slice(0, buffer.length - partialLength);
                if (safeContent && this._state.activeSegment && 'content' in this._state.activeSegment) {
                    (this._state.activeSegment as { content: string }).content += safeContent;
                }
                // Whole buffer is a partial delimiter (nothing safe to emit yet):
                // return null so parse() keeps the buffer for the next chunk —
                // otherwise remaining === buffer spins parse()'s while-loop forever.
                return safeContent
                    ? { segment: null, remaining: buffer.slice(-partialLength) }
                    : null;
            }

            if (buffer.length > endDelim.length) {
                const safeContent = buffer.slice(0, -endDelim.length);
                if (this._state.activeSegment && 'content' in this._state.activeSegment) {
                    (this._state.activeSegment as { content: string }).content += safeContent;
                }
                return { segment: null, remaining: buffer.slice(-endDelim.length) };
            }
            return null;
        }

        const tail = buffer.slice(0, closeIndex);
        if (this._state.activeSegment && 'content' in this._state.activeSegment) {
            (this._state.activeSegment as { content: string }).content += tail;
        }

        const segment = this._state.activeSegment;
        this._state.mode = 'text';
        this._state.activeSegment = null;

        return { segment, remaining: buffer.slice(closeIndex + endDelim.length) };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private _createInitialState(): AparteParserState {
        return {
            mode: 'text',
            buffer: '',
            segments: [],
            activeSegment: null,
            segmentCounter: 0
        };
    }

    private _generateId(): string {
        ++this._state.segmentCounter;
        return `${this._options.idPrefix}-${crypto.randomUUID()}`;
    }

    private _createTextSegment(content: string): AparteTextSegment {
        return {
            id: this._options.autoGenerateIds ? this._generateId() : '',
            type: 'text',
            content: content
        };
    }

    private _createCodeSegment(language: string, content: string): AparteCodeSegment {
        return {
            id: this._options.autoGenerateIds ? this._generateId() : '',
            type: 'code',
            language,
            content
        };
    }

    private _createThinkingSegment(content: string): AparteThinkingSegment {
        return {
            id: this._options.autoGenerateIds ? this._generateId() : '',
            type: 'thinking',
            content,
            collapsed: false,
            label: 'Thinking'
        };
    }

    private _createArtifactSegment(mimeType: string, title?: string): AparteArtifactSegment {
        return {
            id: this._options.autoGenerateIds ? this._generateId() : '',
            type: 'artifact',
            mimeType,
            artifactType: deriveArtifactKind(mimeType),
            title,
            content: ''
        };
    }

    private _isPartialMatch(buffer: string, pattern: string): boolean {
        for (let i = 1; i < pattern.length; i++) {
            if (buffer.endsWith(pattern.slice(0, i))) {
                return true;
            }
        }
        return false;
    }

    private _getPartialMatchLength(buffer: string, pattern: string): number {
        for (let i = pattern.length - 1; i >= 1; i--) {
            if (buffer.endsWith(pattern.slice(0, i))) {
                return i;
            }
        }
        return 0;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a complete markdown string into segments
 * Use this for non-streaming scenarios
 */
export function parseMarkdownToSegments(
    content: string,
    options?: AparteStreamParserOptions
): AparteSegment[] {
    const parser = new AparteStreamParser(options);
    const result = parser.parse(content);
    const finalSegments = parser.finalize();
    return [...result.segments, ...finalSegments];
}

/**
 * Map a MIME type to a short, stable artifact kind identifier.
 *
 * Resolution order: Anthropic's vendor namespace (`application/vnd.ant.<kind>`),
 * exact standard MIMEs, then a substring rescue for parameterised or vendor
 * variants (`text/html; charset=utf-8`, `application/ld+json`, …). Unrecognised
 * MIMEs return `fallback` (default `'unknown'`) — consumers are expected to
 * guard their renderers accordingly.
 *
 * Canonical implementation. `@aparte/engine` keeps a byte-identical copy (core is
 * an OPTIONAL peer there, so it cannot import this at runtime); the engine's
 * `derive-artifact-kind-parity.test.ts` locks the two together.
 *
 * @example
 * deriveArtifactKind('application/vnd.ant.react')  // 'react'
 * deriveArtifactKind('text/html; charset=utf-8')   // 'html'
 * deriveArtifactKind('font/woff2', 'text')         // 'text' (fallback)
 */
export function deriveArtifactKind(mimeType: string, fallback = 'unknown'): string {
    const m = (mimeType || '').toLowerCase().trim();
    const ant = m.match(/^application\/vnd\.ant\.([a-z0-9-]+)/);
    if (ant) return ant[1]!;
    if (m === 'text/html' || m === 'application/xhtml+xml') return 'html';
    if (m === 'application/javascript' || m === 'text/javascript') return 'js';
    if (m === 'text/css') return 'css';
    if (m === 'image/svg+xml') return 'svg';
    if (m === 'application/json') return 'json';
    if (m === 'text/markdown') return 'markdown';
    if (m === 'text/csv') return 'csv';
    if (m === 'text/plain') return 'text';
    if (m.includes('react')) return 'react';
    if (m.includes('html')) return 'html';
    if (m.includes('javascript')) return 'js';
    if (m.includes('css')) return 'css';
    if (m.includes('svg')) return 'svg';
    if (m.includes('json')) return 'json';
    if (m.includes('csv')) return 'csv';
    if (m.includes('markdown')) return 'markdown';
    return fallback;
}
