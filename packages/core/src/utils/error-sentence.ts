import { AparteErrorCode } from '../types/errors.js';
import type { AparteLocale } from '../config/locale.js';

/**
 * The sentence a person reads for an error, chosen by its code — or `undefined` when the
 * error keeps its own message.
 *
 * A transport's or a provider's message is written for a developer, in English, and often
 * names a status or a vendor's field: a visitor reads one plain sentence in their language
 * instead, and the message goes to the console. Errors keep their own text when it was
 * written for the reader already (the turn limit, localized when it is raised), when it is
 * a setup error core raises before any request (`CONFIG_NO_PROVIDER`, no provider
 * selected; `CONFIG_MISSING_KEY`, a provider that is not registered), and when the code is
 * not one of core's: an app's or a plugin's error segment is its own words. A wrong model
 * id or URL is a failed request, and reads as one.
 *
 * "Try again in a moment" is said only where a moment can help: a dropped connection, a
 * timeout, a busy or failing provider. A request the provider refused as malformed, a
 * policy refusal, a tool that crashed or an error nobody classified gets a sentence that
 * promises nothing.
 */
export function errorSentence(code: string | undefined, t: (key: keyof AparteLocale) => string): string | undefined {
    switch (code) {
        case AparteErrorCode.NET_OFFLINE:
        case AparteErrorCode.NET_ERROR:
            return t('errorUnreachable');
        case AparteErrorCode.NET_TIMEOUT:
            return t('errorTimeout');
        case AparteErrorCode.CONFIG_INVALID_KEY:
            return t('errorRefused');
        case AparteErrorCode.USAGE_RATE_LIMIT:
            return t('errorRateLimited');
        case AparteErrorCode.USAGE_CONTEXT_EXCEEDED:
            return t('errorTooLong');
        case AparteErrorCode.PROVIDER_ERROR:
        case AparteErrorCode.PROVIDER_UNAVAILABLE:
            return t('errorFailed');
        case AparteErrorCode.USAGE_BAD_REQUEST:
        case AparteErrorCode.PROVIDER_POLICY:
        case AparteErrorCode.CONFIG_INVALID_MODEL:
        case AparteErrorCode.UNKNOWN_ERROR:
            return t('errorNoAnswer');
        default:
            return undefined;
    }
}
