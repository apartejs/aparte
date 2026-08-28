// AparteCore Standard Error Codes
export enum AparteErrorCode {
    // Configuration Errors (Dev/Host responsibility)
    CONFIG_NO_PROVIDER = 'CONFIG_NO_PROVIDER',
    CONFIG_MISSING_KEY = 'CONFIG_MISSING_KEY',
    CONFIG_INVALID_KEY = 'CONFIG_INVALID_KEY',       // HTTP 401 / 403
    CONFIG_INVALID_MODEL = 'CONFIG_INVALID_MODEL',

    // Usage Errors (User responsibility)
    USAGE_RATE_LIMIT = 'USAGE_RATE_LIMIT',       // HTTP 429
    USAGE_CONTEXT_EXCEEDED = 'USAGE_CONTEXT_EXCEEDED', // HTTP 400
    USAGE_BAD_REQUEST = 'USAGE_BAD_REQUEST',     // HTTP 400

    // Network & Infrastructure
    NET_OFFLINE = 'NET_OFFLINE',
    NET_TIMEOUT = 'NET_TIMEOUT',                 // HTTP 408, or a TimeoutError
    NET_ERROR = 'NET_ERROR',

    // Provider Errors (External Service)
    PROVIDER_ERROR = 'PROVIDER_ERROR',           // HTTP 5xx
    PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE', // HTTP 503
    PROVIDER_POLICY = 'PROVIDER_POLICY',         // Moderation / Policy

    // Internal
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export class AparteError extends Error {
    constructor(
        public override message: string,
        public code: AparteErrorCode,
        public data?: Record<string, unknown>,
        public originalError?: unknown,
        public httpStatus?: number
    ) {
        super(message);
        this.name = 'AparteError';
    }

    /**
     * The code an HTTP status stands for — the table the enum's own comments promise.
     * `undefined` for a status the enum does not name (a 404 can be a wrong model or a
     * wrong URL; the message says which, a code would guess).
     */
    static codeForStatus(status: number | undefined): AparteErrorCode | undefined {
        switch (status) {
            case 400: return AparteErrorCode.USAGE_BAD_REQUEST;
            case 401:
            case 403: return AparteErrorCode.CONFIG_INVALID_KEY;
            case 408: return AparteErrorCode.NET_TIMEOUT;
            case 429: return AparteErrorCode.USAGE_RATE_LIMIT;
            case 503: return AparteErrorCode.PROVIDER_UNAVAILABLE;
            default: return status !== undefined && status >= 500 ? AparteErrorCode.PROVIDER_ERROR : undefined;
        }
    }

    static from(error: unknown, defaultCode = AparteErrorCode.UNKNOWN_ERROR, defaultStatus?: number): AparteError {
        if (error instanceof AparteError) return error;

        const message = error instanceof Error ? error.message : String(error);

        // Try to infer status from error object if possible
        const status = (error as { status?: number; statusCode?: number })?.status || (error as { status?: number; statusCode?: number })?.statusCode || defaultStatus;

        // A caller that names a code keeps it. The default is what this method is for:
        // read what the error says about itself before settling on UNKNOWN — every
        // transport error used to reach the error card as UNKNOWN_ERROR, a 429 and a
        // 503 alike, because nothing here looked.
        const code = defaultCode !== AparteErrorCode.UNKNOWN_ERROR
            ? defaultCode
            : AparteError.codeForStatus(status) ?? AparteError.codeForFailure(error) ?? defaultCode;

        return new AparteError(message, code, undefined, error, status);
    }

    /**
     * What a thrown, statusless error says about itself. `fetch` rejects a network
     * failure with a TypeError whose message names the fetch ("Failed to fetch",
     * "NetworkError when attempting to fetch resource.", "Load failed") — any other
     * TypeError is a bug, not the network, and stays unclassified. `AbortSignal.timeout()`
     * rejects with a TimeoutError.
     */
    private static codeForFailure(error: unknown): AparteErrorCode | undefined {
        if (!(error instanceof Error)) return undefined;
        if (error.name === 'TimeoutError') return AparteErrorCode.NET_TIMEOUT;
        if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            return offline ? AparteErrorCode.NET_OFFLINE : AparteErrorCode.NET_ERROR;
        }
        return undefined;
    }
}
