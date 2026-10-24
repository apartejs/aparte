/**
 * A duration as a person reads it, in the locale's own units: "8s", "1m 12s", "1 min 12 s".
 *
 * `Intl`'s narrow unit style rather than a sentence of our own: the units, their order and
 * their spacing are the locale's, and a translation never has to spell "seconds". A floor
 * of one second — a block that took 300ms still took time, and "0s" reads as nothing.
 */
export function formatDuration(ms: number, tag?: string): string {
    const total = Math.max(1, Math.round(ms / 1000));
    try {
        const unit = (n: number, u: 'second' | 'minute') =>
            new Intl.NumberFormat(tag, { style: 'unit', unit: u, unitDisplay: 'narrow' }).format(n);
        if (total < 60) return unit(total, 'second');
        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        if (!seconds) return unit(minutes, 'minute');
        return new Intl.ListFormat(tag, { style: 'narrow', type: 'unit' }).format([unit(minutes, 'minute'), unit(seconds, 'second')]);
    } catch {
        // An engine without unit formatting (or a tag it rejects) still gets a number.
        return `${total}s`;
    }
}
