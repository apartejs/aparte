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
 * a setup error a developer meets before anyone else does (`CONFIG_NO_PROVIDER`,
 * `CONFIG_MISSING_KEY`, `CONFIG_INVALID_MODEL`), and when the code is not one of core's:
 * an app's or a plugin's error segment is its own words.
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
        case AparteErrorCode.USAGE_BAD_REQUEST:
        case AparteErrorCode.PROVIDER_ERROR:
        case AparteErrorCode.PROVIDER_UNAVAILABLE:
        case AparteErrorCode.PROVIDER_POLICY:
        case AparteErrorCode.UNKNOWN_ERROR:
            return t('errorFailed');
        default:
            return undefined;
    }
}
