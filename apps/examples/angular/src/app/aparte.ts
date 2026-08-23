export const KEY_STORAGE = 'aparte.openrouter.key';

/** Dispatch a send from the composer so the client (and the optimistic user bubble) both fire. */
export function sendPrompt(text: string): void {
    document.querySelector('aparte-composer')?.dispatchEvent(
        new CustomEvent('aparte-send', {
            detail: { content: text, timestamp: Date.now() },
            bubbles: true,
            composed: true,
        }),
    );
}
