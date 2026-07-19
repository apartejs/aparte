/**
 * Escape a value for safe interpolation into a DOUBLE-QUOTED CSS attribute
 * selector: `[attr="${cssEscape(value)}"]`. Inside a quoted CSS string only `"`
 * (which would end the string) and `\` (the escape char) are special, so escaping
 * those two is sufficient AND correct here — unlike `CSS.escape`, which targets the
 * UNquoted identifier context and over-escapes inside quotes (breaking the match),
 * and which also needs the `CSS` global (absent in SSR / some test runtimes).
 *
 * Segment/message ids are random UUIDs in the default flow, so this is
 * defense-in-depth: a hostile, stream-supplied id containing `"` (e.g. a tool-call
 * id) can no longer break out of the selector into a `SyntaxError` or a
 * selector-list that mis-targets another element.
 */
export function cssEscape(value: string): string {
    return value.replace(/["\\]/g, '\\$&');
}
