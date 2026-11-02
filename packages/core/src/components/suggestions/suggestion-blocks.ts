/**
 * Replies an answer offers, written as text: a ```suggestions block of JSON in a reply,
 * for a backend that only sends text (an n8n workflow, a plain completion), the way
 * `@aparte/plugin-cards` reads a ```card-<name> block. Nothing of it shows in the
 * message: `<aparte-suggestions answers>` above the composer shows the replies of the last
 * answer, and a click sends one as if typed.
 *
 *   Which day suits you?
 *   ```suggestions
 *   ["Tuesday 3", "Wednesday 4", "Another week"]
 *   ```
 *
 * A reply sends what its button SHOWS, and only that. The block is model text, and a chip
 * that showed "No, cancel" while sending a prompt the model wrote ("Yes, I confirm the
 * transfer") would put words in the person's mouth. A `{label, prompt}` object is read
 * for its label; its `prompt` is ignored, however close it is to the label, because a prompt
 * that begins with the label can still go on to say the opposite. A page that wants a hidden
 * prompt writes it in the `suggestions` attribute of the element, which is the page's own.
 *
 * One more user of `registerCodeLanguageRenderer`, the seam a block's language goes
 * through: no system of its own.
 */
import { aparteGlobalConfig, type AparteConfig } from '../../config/index.js';
import { escapeAttr, escapeHtml } from '../../utils/escape.js';

/** The language the block is written in. */
export const SUGGESTIONS_BLOCK_LANGUAGE = 'suggestions';

type Reply = string | { label: string; prompt?: string };

/** Runs of whitespace, in any script (a no-break space does not collapse under `nowrap`). */
const SPACES = /[\p{Z}\s]+/gu;
/**
 * What a chip cannot be allowed to hold, because it draws nothing or draws something other than
 * what is sent: controls, private-use and unassigned code points, lone surrogates, a blank
 * braille cell, and every default-ignorable code point (zero-width and bidi controls, soft
 * hyphen, fillers, variation selectors, the tag characters a model reads as hidden text) except
 * the joiners and the two emoji variation selectors, whose place `joinersBelong` checks.
 */
const DRAWS_NOTHING = /[\p{Cc}\p{Co}\p{Cn}\p{Cs}\u2800]|(?!(?:\u200C|\u200D|\uFE0E|\uFE0F))\p{Default_Ignorable_Code_Point}/u;
/**
 * The three flags written as a tag sequence (England, Scotland, Wales): a black flag, tag
 * characters spelling a region, and a cancel tag. The tag characters are default-ignorable, so
 * they are read as the flag they draw, and only these three: any other run of tag characters is
 * hidden text.
 */
const SUBDIVISION_FLAG = /\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F}/gu;
/**
 * A mark with no letter before it, or five non-spacing marks in a row: a label that overprints.
 * Spacing marks take up their own width and cannot overprint (a Burmese syllable has five marks
 * in a row, three of them spacing).
 */
const OVERPRINTS = /(?:^| )\p{M}|\p{Mn}{5,}/u;
const JOINERS = new Set(['\u200C', '\u200D', '\uFE0E', '\uFE0F']);
const KEYCAP_BASE = /^[0-9#*]$/;
const EMOJI = /^\p{Emoji}$/u;
const PICTOGRAPH = /^\p{Extended_Pictographic}$/u;
const EMOJI_MODIFIER = /^\p{Emoji_Modifier}$/u;
/** The scripts that are written with a joiner or a non-joiner inside a word. */
const SHAPES_WITH_JOINERS = /^[\p{scx=Arab}\p{scx=Syrc}\p{scx=Thaa}\p{scx=Nkoo}\p{scx=Adlm}\p{scx=Rohg}\p{scx=Mong}\p{scx=Deva}\p{scx=Beng}\p{scx=Guru}\p{scx=Gujr}\p{scx=Orya}\p{scx=Taml}\p{scx=Telu}\p{scx=Knda}\p{scx=Mlym}\p{scx=Sinh}\p{scx=Mymr}\p{scx=Khmr}]$/u;
/** A virama: the sign that ends a consonant, after which a joiner may close the word (the Malayalam chillu). */
const VIRAMA = /^[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D4D\u0DCA\u1039\u17D2]$/;

/**
 * True when every joiner and variation selector of `label` sits where a reader sees what it does.
 * Anywhere else it draws nothing, and four invisible symbols between the letters of an ordinary
 * label carry a message the person never sees and the chip sends.
 *
 * - A variation selector follows an emoji (and after a digit, `#` or `*` only to make a keycap).
 * - A zero-width joiner sits inside an emoji sequence: a pictograph (or its skin tone, or the
 *   selector that follows one) before it and a pictograph after it.
 * - Either joiner otherwise sits between two letters of a script that is written with them
 *   (Arabic, Persian, the Indic scripts, Sinhala, Myanmar, Khmer…), or ends a word after a virama.
 *   In a Latin, Greek, Cyrillic or CJK label it draws nothing, so it is refused.
 *
 * What stays: in a script that uses a joiner, one is still invisible to a reader who does not read
 * that script. The 100-character cap on a label bounds it.
 */
function joinersBelong(label: string): boolean {
    const cps = Array.from(label);
    for (let i = 0; i < cps.length; i++) {
        const c = cps[i]!;
        if (!JOINERS.has(c)) continue;
        const prev = cps[i - 1] ?? '';
        const next = cps[i + 1] ?? '';
        if (c === '\uFE0E' || c === '\uFE0F') {
            if (KEYCAP_BASE.test(prev)) { if (c !== '\uFE0F' || next !== '\u20E3') return false; }
            else if (!EMOJI.test(prev)) return false;
            continue;
        }
        if (c === '\u200D') {
            const base = prev === '\uFE0F' ? (cps[i - 2] ?? '') : prev;
            if ((PICTOGRAPH.test(base) || EMOJI_MODIFIER.test(base)) && PICTOGRAPH.test(next)) continue;
        }
        if (SHAPES_WITH_JOINERS.test(prev) && (SHAPES_WITH_JOINERS.test(next) || (VIRAMA.test(prev) && (next === '' || next === ' ')))) continue;
        return false;
    }
    return true;
}

/** The longest label a chip shows. A longer one is a paragraph, and the click would send all of it. */
const MAX_LABEL = 100;

/**
 * A model-written reply, reduced to what its button shows: the label alone, never a `prompt`.
 * Runs of whitespace collapse to one space. `null` for a reply with no label to see (blank),
 * a label with anything in it that draws nothing or reorders what is drawn (bidi controls,
 * tag characters, variation selectors, stray joiners), and a label past 100 characters: what
 * is sent must be exactly what the person can read on the chip.
 */
export function visibleReply(reply: Reply): string | null {
    const label = (typeof reply === 'string' ? reply : reply.label).replace(SPACES, ' ').trim();
    if (!label || label.length > MAX_LABEL) return null;
    // The three tag-sequence flags are read as the flag they draw, before the tag characters are refused.
    const drawn = label.replace(SUBDIVISION_FLAG, '\u{1F3F4}');
    if (DRAWS_NOTHING.test(drawn)) return null;
    if (OVERPRINTS.test(drawn) || !joinersBelong(drawn)) return null;
    return label;
}

/** The ends of a block's replies that were not offered, once per block: a developer is told, a reader is not. */
const told = new Set<string>();

function tellDropped(source: string, dropped: string[]): void {
    if (dropped.length === 0 || told.has(source)) return;
    if (told.size >= 50) told.clear();
    told.add(source);
    console.warn(`[aparte-suggestions] ${dropped.length} reply(ies) of a suggestions block not offered, since a chip sends exactly what it shows: ${dropped.map((d) => JSON.stringify(d)).join(', ')}. A reply must be 1 to ${MAX_LABEL} characters and hold nothing invisible (zero-width, bidi or tag characters, stray joiners).`);
}

/** The replies a block holds, or `null` when it is not an array of replies. */
function readReplies(source: string): string[] | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(source);
    } catch {
        return null;
    }
    if (!Array.isArray(parsed)) return null;
    const asked = parsed.filter((r): r is Reply =>
        typeof r === 'string'
        || (typeof r === 'object' && r !== null && typeof (r as { label?: unknown }).label === 'string'));
    const replies: string[] = [];
    const dropped: string[] = [];
    for (const r of asked) {
        const shown = visibleReply(r);
        if (shown !== null) replies.push(shown);
        else if ((typeof r === 'string' ? r : r.label).trim()) dropped.push(typeof r === 'string' ? r : r.label);
    }
    tellDropped(source, dropped);
    return replies.length ? replies : null;
}

/**
 * Read the code blocks in language `suggestions` in replies as the replies that
 * `<aparte-suggestions answers>` offers. Returns the function that stops it. Off until called: a block is then no longer
 * shown as code, so it is the app's choice.
 *
 * @example
 * setupSuggestionBlocks();
 * // and, in the composer, an `<aparte-suggestions answers>` element
 */
export function setupSuggestionBlocks(config: AparteConfig = aparteGlobalConfig): () => void {
    return config.registerCodeLanguageRenderer({
        languages: [SUGGESTIONS_BLOCK_LANGUAGE],
        // Not code to its reader, and not shown at all: no card around it.
        bare: true,
        render: ({ source, open }) => {
            // The replies arrive whole: nothing while the block is still being written.
            if (open) return '';
            const replies = readReplies(source);
            if (!replies) return `<code class="aparte-code-error">${escapeHtml(source)}</code>`;
            return `<span class="aparte-suggestions-mark" hidden data-aparte-suggestions="${escapeAttr(JSON.stringify(replies))}"></span>`;
        },
    });
}
