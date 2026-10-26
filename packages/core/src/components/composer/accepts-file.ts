/**
 * Whether `file` matches an `accept` list the way the browser's picker reads one: `.ext`
 * against the name, `type/*` against the MIME family, anything else against the exact MIME
 * type, all case-insensitive. No list, or an empty one, admits everything.
 *
 * The picker's own filter is a suggestion — its dialog offers "All files" — and a drop or a
 * paste never sees the list at all, so it is checked again where the file arrives.
 */
export function acceptsFile(accept: string | null | undefined, file: File): boolean {
    const tokens = (accept ?? '').split(',').map((token) => token.trim().toLowerCase()).filter(Boolean);
    if (tokens.length === 0) return true;
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return tokens.some((token) =>
        token.startsWith('.') ? name.endsWith(token)
            : token.endsWith('/*') ? type.startsWith(token.slice(0, -1))
                : type === token);
}
