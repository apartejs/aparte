/**
 * The headers of a request to the library's own server handlers: the consumer's own, and a
 * `Content-Type` of `application/json` that is the ONLY one.
 *
 * `{ 'Content-Type': 'application/json', ...theirs }` is two keys when theirs is spelled
 * `content-type`, and `fetch` joins them into one header, `application/json, application/json`,
 * which the handlers' content-type check (`refuseUnsafeRequest`) does not read as JSON.
 */
export function jsonHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(extra ?? {})) {
        if (name.toLowerCase() !== 'content-type') headers[name] = value;
    }
    headers['Content-Type'] = 'application/json';
    return headers;
}
