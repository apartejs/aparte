// AparteCore Standard Error Codes
export enum AparteErrorCode {
    // Configuration Errors (Dev/Host responsibility)
    CONFIG_NO_PROVIDER = 'CONFIG_NO_PROVIDER',
    CONFIG_MISSING_KEY = 'CONFIG_MISSING_KEY',
    CONFIG_INVALID_MODEL = 'CONFIG_INVALID_MODEL',

    // Usage Errors (User responsibility)
    USAGE_RATE_LIMIT = 'USAGE_RATE_LIMIT',       // HTTP 429
    USAGE_CONTEXT_EXCEEDED = 'USAGE_CONTEXT_EXCEEDED', // HTTP 400
    USAGE_BAD_REQUEST = 'USAGE_BAD_REQUEST',     // HTTP 400

    // Network & Infrastructure
    NET_OFFLINE = 'NET_OFFLINE',
    NET_TIMEOUT = 'NET_TIMEOUT',
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

    static from(error: unknown, defaultCode = AparteErrorCode.UNKNOWN_ERROR, defaultStatus?: number): AparteError {
        if (error instanceof AparteError) return error;

        const message = error instanceof Error ? error.message : String(error);

        // Try to infer status from error object if possible
        const status = (error as { status?: number; statusCode?: number })?.status || (error as { status?: number; statusCode?: number })?.statusCode || defaultStatus;

        return new AparteError(message, defaultCode, undefined, error, status);
    }
}
