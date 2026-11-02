/**
 * The two cheap checks the agent and chat handlers make before they authorize, read or
 * run anything — against a cross-site request riding on the visitor's cookie.
 *
 * A page on another site can POST to these endpoints without a preflight, and with the
 * visitor's cookies, as long as the request is "simple": a form with
 * `enctype="text/plain"` is one, and its body can be shaped into valid JSON. Two things
 * stop it. The library's own clients always send `application/json`, which a form cannot
 * send, so requiring it costs a legitimate caller nothing. And a host that knows its pages
 * can name them (`allowedOrigins`): a browser always puts the real `Origin` on a POST.
 */

/** `415` unless the body is declared `application/json` (parameters such as `charset` ignored); `403` for an `Origin` the host did not list. */
export function refuseUnsafeRequest(req: Request, allowedOrigins?: readonly string[]): Response | null {
    const type = (req.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (type !== 'application/json') {
        return guardError(415, 'Send the body as application/json.');
    }
    if (allowedOrigins) {
        // No `Origin` is a caller that is not a browser page (a server, curl): there is no
        // visitor's cookie for it to ride on, and `authorize` still decides.
        const origin = req.headers.get('origin');
        if (origin !== null && !allowedOrigins.includes(origin)) {
            return guardError(403, 'This origin is not allowed.');
        }
    }
    return null;
}

function guardError(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: { message } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
