/**
 * An HTTP error from n8n, said so the developer knows what to change in the workflow.
 *
 * n8n answers an error as JSON `{ message, hint }` (a 404 for a workflow that is not
 * active carries the hint to activate it), and a proxy in front of it answers as an HTML
 * page — a 502 or a 504 when the workflow ran longer than the proxy waits.
 */
import { AparteError, AparteErrorCode } from '@aparte/core';

const PROXY_STATUS = new Set([502, 504, 524]);

/** What the request was for, said in the messages that depend on it. */
export type N8nRequestKind = 'answer' | 'history';

function credentialNames(body: { credentials?: unknown }): string {
    const list = Array.isArray(body.credentials) ? body.credentials : [];
    const names = list
        .map((c) => (typeof c === 'object' && c !== null ? (c as { credentialName?: unknown }).credentialName : undefined))
        .filter((name): name is string => typeof name === 'string' && name.length > 0);
    return names.length > 0 ? ` (${names.join(', ')})` : '';
}

export async function httpError(response: Response, kind: N8nRequestKind): Promise<AparteError> {
    const status = response.status;
    const text = (await response.text().catch(() => '')).trim();
    const code = AparteError.codeForStatus(status) ?? AparteErrorCode.PROVIDER_ERROR;
    const make = (message: string, errorCode: AparteErrorCode = code) => new AparteError(message, errorCode, undefined, undefined, status);

    // A page, not an answer: never show its markup to the person chatting.
    if (text.startsWith('<') || (response.headers.get('content-type') ?? '').includes('text/html')) {
        return PROXY_STATUS.has(status)
            ? make(`A proxy in front of n8n gave up waiting (HTTP ${status}). The workflow may still be running — its execution list shows the result.`, AparteErrorCode.NET_TIMEOUT)
            : make(`n8n answered HTTP ${status} with a web page instead of a chat answer. Check that the URL is the Chat Trigger's production URL, the one that ends in /chat.`);
    }

    let body: { message?: unknown; hint?: unknown; status?: unknown; credentials?: unknown } = {};
    try { body = JSON.parse(text) as typeof body; } catch { /* not JSON: its text below */ }

    // The Chat Trigger checks the workflow's credentials before it runs it.
    if (status === 428 || body.status === 'credential_connections_required') {
        return make(`The n8n workflow cannot run until its credentials are connected${credentialNames(body)}. Connect them in n8n, then try again.`);
    }
    if (body.status === 'credential_readiness_check_failed') {
        return make('n8n could not check the workflow\'s credentials. Open the workflow in n8n to see which one fails.');
    }
    // Loading a session's history from memory needs the memory on the trigger too.
    if (kind === 'history' && status === 500) {
        return make('n8n could not load the conversation\'s history. When the Chat Trigger\'s "Load Previous Session" '
            + 'is "From Memory", connect the memory node to the Chat Trigger as well as to the agent.');
    }

    let message = typeof body.message === 'string' ? body.message : text;
    if (typeof body.message === 'string' && typeof body.hint === 'string') message = `${body.message} ${body.hint}`;
    return make(message.slice(0, 400) || `The n8n workflow answered HTTP ${status}.`);
}

/**
 * The request never reached an answer: n8n is down, the URL is wrong, or the browser
 * refused the answer because the Chat Trigger does not allow this page's origin — which
 * the browser reports exactly like a network failure, so all three are named.
 */
export function unreachable(error: unknown, url: string): unknown {
    if (!(error instanceof TypeError)) return error;
    const origin = typeof location === 'undefined' ? "this page's origin" : location.origin;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return new AparteError(
        `Could not reach n8n at ${url}. Check that it is the Chat Trigger's production URL, that the workflow is published, `
        + `and that ${origin} is in the trigger's Allowed Origins (CORS).`,
        offline ? AparteErrorCode.NET_OFFLINE : AparteErrorCode.NET_ERROR,
    );
}
