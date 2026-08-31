import { Injectable, OnDestroy, inject, InjectionToken } from '@angular/core';
import { AparteClient, AparteClientOptions } from '@aparte/core';

/**
 * Injection token for AparteClient configuration. Provided by `provideAparte()`;
 * omit it and the service falls back to `{}`.
 */
export const APARTE_CLIENT_OPTIONS = new InjectionToken<AparteClientOptions>('APARTE_CLIENT_OPTIONS');

/**
 * AparteAiService
 *
 * Angular service to bridge the UI events with AI Providers.
 * Uses the agnostic `AparteClient` under the hood.
 */
@Injectable({
    providedIn: 'root'
})
export class AparteAiService implements OnDestroy {
    private readonly _clientOptions = inject(APARTE_CLIENT_OPTIONS, { optional: true });
    private _client: AparteClient = new AparteClient(this._clientOptions ?? {});

    /**
     * Start listening to `aparte-send` events globally.
     * This connects the <aparte-chat> components to the AI Providers.
     *
     * `provideAparte()` calls this for you on app init (its `autoConnect`,
     * on by default). Idempotent — a manual call on top of that is a no-op,
     * so it stays the escape hatch when configuring without `provideAparte`.
     */
    connect(): void {
        this._client.start();
    }

    /**
     * Stop listening.
     */
    disconnect(): void {
        this._client.stop();
    }

    /**
     * Abort the current AI response and all active tool calls.
     */
    abort(): void {
        this._client.abort();
    }

    ngOnDestroy(): void {
        this.disconnect();
    }
}
