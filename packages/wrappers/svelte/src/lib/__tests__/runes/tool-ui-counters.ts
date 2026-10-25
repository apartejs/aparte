/** What the test cards record about their own lifecycle, read by the spec. */
export const counters = { mounts: 0, unmounts: 0 };

export function resetCounters(): void {
    counters.mounts = 0;
    counters.unmounts = 0;
}
