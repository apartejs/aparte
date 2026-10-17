/**
 * A preview frame's height before its document says how tall it is, read from the demo's own
 * markup: most demos that need room declare it on their first element (`style="height: 26rem"`).
 * That height plus the stage's padding (2rem above and below, PreviewDocument) is what the
 * document will report, so the frame starts at its final size and nothing under it moves.
 *
 * A demo that declares nothing keeps the frame's default floor and is measured as before.
 */
const STAGE_PADDING_PX = 64;
const MAX_PX = 640;

export function frameHeight(html: string): number | undefined {
    // The first element, comments and whitespace skipped.
    const first = html.replace(/<!--[\s\S]*?-->/g, '').match(/<[a-z][^>]*>/i)?.[0] ?? '';
    const style = first.match(/style="([^"]*)"/)?.[1] ?? '';
    // The `height` declaration itself — not `max-height`, nor a custom property ending in one.
    const declaration = style.split(';').find((d) => d.split(':')[0]?.trim() === 'height');
    const rem = declaration?.match(/:\s*([\d.]+)rem\s*$/)?.[1];
    if (!rem) return undefined;
    return Math.min(Math.round(Number(rem) * 16) + STAGE_PADDING_PX, MAX_PX);
}
