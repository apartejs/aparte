/**
 * Send a suggested prompt the way the user would: put it in the composer and let
 * the composer submit it.
 *
 * This used to dispatch a synthetic `aparte-send` instead, which looked equivalent
 * and was not: `submit()` is where every gate lives — the composer being disabled,
 * a turn already streaming, and the `requireModelSelection` gate that is still on
 * while `GET /models` is in flight. So the suggestion chips were live while the
 * composer was visibly greyed out, and a click sent a request with an empty model
 * id. Going through the composer also puts the text where the user can see it went.
 */
export function sendPrompt(text: string): void {
    const composer = document.querySelector('aparte-composer') as
        (HTMLElement & { setValue(v: string): void; submit(): void }) | null;
    composer?.setValue(text);
    composer?.submit();
}
