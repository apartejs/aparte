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

import { deriveArtifactKind } from '@aparte/engine';
import type { AparteStreamBlock } from '../types/stream-blocks.js';
import type {
    AparteSegment,
    AparteTextSegment,
    AparteCodeSegment,
    AparteThinkingSegment,
    AparteArtifactSegment,
} from '../types/index.js';
import { uuid } from '../utils/uuid.js';

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
    /**
     * Tagged blocks to recognise in the prose — `<tag attr="…">…</tag>` — each turned
     * into the segment its grammar builds. The stream adapter passes the blocks
     * registered on the config (`registerStreamBlock`); pass your own when you drive
     * the parser yourself. See {@link AparteStreamBlock}.
     */
    blocks?: AparteStreamBlock[];
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
    mode: 'text' | 'code' | 'thinking' | 'artifact' | 'block';
    /** Buffer for incomplete patterns */
    buffer: string;
    /** Current code block language */
    codeLanguage?: string;
    /** Close delimiter of the thinking pair currently open (multi-delimiter support) */
    thinkingEnd?: string;
    /** Closing tag of the registered block currently open (`</tag>`). */
    blockEnd?: string;
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
    /** The registered block grammars, in registration order. */
    private _blocks: AparteStreamBlock[];
    private _state: AparteParserState;

    constructor(options: AparteStreamParserOptions = {}) {
        const delims = options.thinkingDelimiters;
        this._thinkingDelimiters = delims
            ? (Array.isArray(delims) ? delims : [delims])
            : DEFAULT_THINKING_DELIMITERS;
        this._blocks = options.blocks ?? [];
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
                // `code` too: a reply ending on ``` with no newline before it stays in
                // code mode until here (the mid-stream shortcut that closed it is gone),
                // and the fence must not land inside the block as three literal backticks.
                if (seg.type === 'text' || seg.type === 'code') content = stripTrailingFence(content);
                seg.content = content;
            }
            finalSegments.push(this._closed(this._state.activeSegment));
            this._state.activeSegment = null;
            this._state.buffer = '';
        } else if (this._state.buffer.trim()) {
            // Remaining buffer becomes text segment
            finalSegments.push(this._closed(this._createTextSegment(stripTrailingFence(this._state.buffer))));
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
            case 'block':
                return this._parseBlockMode(buffer);
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

        // Registered blocks: the earliest whole-tag match wins, like the delimiters.
        // A `<tag` cut at the end of the buffer is not a match yet — the next chunk
        // decides whether it is `<tag>` or `<tagline>` — so it is held back below.
        let blockStart = -1;
        let blockHit: AparteStreamBlock | undefined;
        for (const b of this._blocks) {
            const i = this._indexOfTag(buffer, b.tag);
            if (i !== -1 && (blockStart === -1 || i < blockStart)) { blockStart = i; blockHit = b; }
        }

        // Determine which pattern comes first
        const patterns: { type: 'code' | 'thinking' | 'artifact' | 'block'; index: number }[] = [];
        if (codeBlockStart !== -1) patterns.push({ type: 'code', index: codeBlockStart });
        if (thinkingStart !== -1) patterns.push({ type: 'thinking', index: thinkingStart });
        if (artifactStart !== -1) patterns.push({ type: 'artifact', index: artifactStart });
        if (blockStart !== -1) patterns.push({ type: 'block', index: blockStart });

        patterns.sort((a, b) => a.index - b.index);

        if (patterns.length === 0) {
            // No special patterns found
            // Check if buffer might be start of a pattern (keep it for next chunk)
            if (buffer.endsWith('`') || buffer.endsWith('``') ||
                this._thinkingDelimiters.some(p => this._isPartialMatch(buffer, p.start)) ||
                this._isPartialMatch(buffer, '<artifact') ||
                // `<ta`, and also the whole `<tag` with nothing after it yet.
                this._blocks.some(b => this._isPartialMatch(buffer, '<' + b.tag) || buffer.endsWith('<' + b.tag))) {
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
            // The text is over BECAUSE something else is starting — an end as
            // definite as a closing delimiter.
            segmentToEmit = this._closed(this._state.activeSegment);
            this._state.activeSegment = null;
        }

        // Every branch below can fail to start its block because the opening line
        // is not complete yet (a tokenizer routinely splits ``` from its language
        // tag). When that happens the text segment detached above must go BACK —
        // dropping it loses the prose that preceded the block, and the caller,
        // seeing no segments at all, appends the raw delta to the bubble instead,
        // which is how a literal ```python ends up in the rendered message.
        if (firstPattern.type === 'code') {
            const res = this._startCodeBlock(buffer);
            if (!res) {
                if (segmentToEmit) this._state.activeSegment = segmentToEmit;
                return null;
            }
            return { segment: segmentToEmit, remaining: res.remaining };
        } else if (firstPattern.type === 'thinking') {
            const res = this._startThinkingBlock(buffer);
            if (!res) {
                if (segmentToEmit) this._state.activeSegment = segmentToEmit;
                return null;
            }
            return { segment: segmentToEmit, remaining: res.remaining };
        } else if (firstPattern.type === 'artifact') {
            const res = this._startArtifactBlock(buffer);
            if (!res) {
                // Opening tag incomplete — same restore as the two branches above.
                if (segmentToEmit) this._state.activeSegment = segmentToEmit;
                return null;
            }
            return { segment: segmentToEmit, remaining: res.remaining };
        } else {
            const res = this._startBlock(buffer, blockHit!);
            if (!res) {
                if (segmentToEmit) this._state.activeSegment = segmentToEmit;
                return null;
            }
            // A self-closing tag is a block with no body, opened and closed in one
            // step. One segment per step: when text preceded it, emit the text now and
            // leave the tag in the buffer — the next step finds it at index 0 with no
            // text pending and emits the block itself.
            if (res.segment && segmentToEmit) {
                this._state.mode = 'text';
                this._state.activeSegment = null;
                this._state.blockEnd = undefined;
                return { segment: segmentToEmit, remaining: buffer };
            }
            return { segment: segmentToEmit ?? res.segment, remaining: res.remaining };
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
            // No "close on a bare ``` at the end of the buffer" any more. A fence
            // closes on its own line (CommonMark), and the main rule above says so —
            // this branch relaxed it for whatever chunk happened to end in three
            // backticks, so a line like  const s = "```"  split by the tokenizer right
            // after the quotes closed the block mid-code, and the rest of the file
            // streamed as prose. A reply that really ends on ``` with no newline is
            // handled once, at `finalize()`, where the fence can be stripped safely.

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

        const segment = this._closed(this._state.activeSegment);
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

        const segment = this._closed(this._state.activeSegment);
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

        // BOTH spellings are read. This parser accepted `type=` only, while the XML
        // state machine that handles the very same tag on the artifact-xml path reads
        // `mimeType=` — so one `<artifact mimeType="text/html">` became `text/html`
        // or `text/plain` depending on which path happened to consume it, and a whole
        // artifact silently degraded to plain text. `mimeType` wins when both are
        // present; `type` stays supported so existing prompts keep working.
        const mimeMatch = inner.match(/\bmimeType\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
        const typeMatch = inner.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
        const titleMatch = inner.match(/\btitle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);

        const mimeType = (mimeMatch && (mimeMatch[1] ?? mimeMatch[2]))
            ?? (typeMatch && (typeMatch[1] ?? typeMatch[2]))
            ?? 'text/plain';
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

        const segment = this._closed(this._state.activeSegment);
        this._state.mode = 'text';
        this._state.activeSegment = null;

        return { segment, remaining: buffer.slice(closeIndex + endDelim.length) };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    // ─── registered blocks ──────────────────────────────────────────────────

    /**
     * Where `<tag` opens a block in `buffer`, or -1. A hit needs the name to END
     * there: `<artifacts>` is not `<artifact>`, so the character after the name must
     * be whitespace, `/` or `>`. A `<tag` sitting at the very end of the buffer is
     * undecidable and reported as -1 — the partial-match hold in `_parseTextMode`
     * keeps it for the next chunk.
     */
    private _indexOfTag(buffer: string, tag: string): number {
        const open = '<' + tag;
        let from = 0;
        for (;;) {
            const i = buffer.indexOf(open, from);
            if (i === -1) return -1;
            const next = buffer[i + open.length];
            if (next === undefined) return -1;
            if (next === '>' || next === '/' || /\s/.test(next)) return i;
            from = i + 1;
        }
    }

    /**
     * Open a registered block. The buffer starts with `<tag`; the whole opening tag
     * must be present (its `>`) or we wait. Attributes are read as written —
     * `a="x"`, `a='x'`, `a=x` — and a self-closing `<tag …/>` is a block with no
     * body, returned closed at once.
     */
    private _startBlock(buffer: string, block: AparteStreamBlock): { segment: AparteSegment | null; remaining: string } | null {
        const tagEnd = buffer.indexOf('>');
        if (tagEnd === -1) return null;
        const inner = buffer.slice(1 + block.tag.length, tagEnd);
        const selfClosing = inner.trimEnd().endsWith('/');
        const attrSource = selfClosing ? inner.trimEnd().slice(0, -1) : inner;

        const attrs: Record<string, string> = Object.create(null);
        for (const m of attrSource.matchAll(/([A-Za-z_][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
            attrs[m[1]!] = m[2] ?? m[3] ?? m[4] ?? '';
        }

        // A grammar may build a type of its own — the union is closed, the registry is
        // not, which is the documented `registerSegmentRenderer({ type: 'chart' })` case.
        const segment = block.toSegment({ attrs, id: this._options.autoGenerateIds ? this._generateId() : '' }) as unknown as AparteSegment & { content: string };
        segment.content = '';
        const remaining = buffer.slice(tagEnd + 1);
        if (selfClosing) return { segment: this._closed(segment), remaining };

        segment.isStreaming = true;
        this._state.mode = 'block';
        this._state.blockEnd = `</${block.tag}>`;
        this._state.activeSegment = segment;
        return { segment: null, remaining };
    }

    /**
     * Stream the body of the open block until its closing tag — the same
     * partial-delimiter handling the thinking and artifact modes use, so a closing
     * tag split across two chunks is never emitted as content.
     */
    private _parseBlockMode(buffer: string): { segment: AparteSegment | null; remaining: string } | null {
        const endDelim = this._state.blockEnd!;
        const closeIndex = buffer.indexOf(endDelim);
        const active = this._state.activeSegment as (AparteSegment & { content: string }) | null;

        if (closeIndex === -1) {
            if (this._isPartialMatch(buffer, endDelim)) {
                const partialLength = this._getPartialMatchLength(buffer, endDelim);
                const safeContent = buffer.slice(0, buffer.length - partialLength);
                if (safeContent && active) active.content += safeContent;
                return safeContent
                    ? { segment: null, remaining: buffer.slice(-partialLength) }
                    : null;
            }
            if (buffer.length > endDelim.length) {
                const safeContent = buffer.slice(0, -endDelim.length);
                if (active) active.content += safeContent;
                return { segment: null, remaining: buffer.slice(-endDelim.length) };
            }
            return null;
        }

        if (active) active.content += buffer.slice(0, closeIndex);
        const segment = this._closed(this._state.activeSegment);
        this._state.mode = 'text';
        this._state.activeSegment = null;
        this._state.blockEnd = undefined;
        return { segment, remaining: buffer.slice(closeIndex + endDelim.length) };
    }

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
        return `${this._options.idPrefix}-${uuid()}`;
    }

    /**
     * Mark a segment the parser has just CLOSED.
     *
     * The end of a delimited segment is not a guess: the closing token IS the end.
     * `</think>`, a closing fence, `</artifact>` — and, for a text run, the opening
     * of whatever comes next. The parser computes that moment at six sites and used
     * to drop it, emitting the finished segment with no flag saying so.
     *
     * What that cost: nothing downstream could tell a finished reasoning block from
     * one still streaming, so the only remaining signal was the END OF THE TURN. A
     * reader watched "Thinking" for as long as the answer took to stream — twenty
     * seconds after the model had stopped thinking — and the Markdown flush and the
     * highlight-on-settle waited exactly as long. Two workarounds were written
     * before this one: close at the end of the message (wrong value), and close when
     * the next segment opens (right value, wrong moment, and no help for a reply
     * that is reasoning and nothing else).
     *
     * Both agent loops share this parser, so saying it here says it once.
     *
     * Not every end is in band, and the exceptions are honest: a text run that ends
     * only because the STREAM ended has no delimiter — `finalize()` is its truth —
     * and a `tool_call` never passes through here at all, since its end is its
     * `status`.
     */
    private _closed<T extends AparteSegment | null>(segment: T): T {
        if (segment) (segment as AparteSegment).isStreaming = false;
        return segment;
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
 * Artifact kind from a MIME type — the engine's implementation, re-exported so the
 * name stays on core's surface. Core used to keep the canonical copy and engine a
 * byte-identical one, locked together by a parity test; with core depending on
 * engine (D1) there is one function object and nothing to lock.
 */
export { deriveArtifactKind };
