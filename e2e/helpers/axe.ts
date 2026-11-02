/**
 * The axe scan, shared.
 *
 * Extracted from `a11y.spec.ts` when a second spec needed it: the elicitation
 * panel can only be scanned where a tool actually reaches the model, which is
 * `vanilla` and not the seven apps `a11y.spec.ts` runs on. Copying the two
 * subtleties below into a second file is how they stop being true in one of them.
 */

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/** The two severities that make a UI unusable. Tighten once the surface is clean. */
export const GATED_IMPACTS = ['critical', 'serious'];

/**
 * Let CSS transitions land before scanning.
 *
 * axe computes contrast from the **composited** colors, so a scan taken mid-fade
 * sees a half-transparent foreground and reports a violation that does not exist
 * once the animation settles. That is what made the idle scan fail intermittently
 * on the welcome block's fade-in (`#878387 on #f7f3ea`, 3.37:1 — a blend, not a
 * declared colour).
 *
 * Infinite animations are skipped on purpose: the typing dots and the spinners
 * never finish, by design.
 *
 * Settled means a whole frame with none running, not the end of the ones listed once. A
 * single snapshot let two kinds through: a transition cancelled and replaced while it was
 * awaited (its `finished` rejects at once, and the rejection was swallowed), and one that
 * started after the snapshot. The open approval panel's scan read the welcome heading at a
 * quarter of its opacity on CI's WebKit (`#c2c2c2 on #ffffff`, 1.78:1): the panel opens
 * about 120 ms into the welcome's 200 ms fade, so whatever restarts that fade lands in the
 * scan.
 */
export async function settleTransitions(page: Page): Promise<void> {
    await page.evaluate(async () => {
        const running = (): Animation[] => document.getAnimations().filter((a) => {
            const iterations = (a.effect as KeyframeEffect | null)?.getTiming?.().iterations;
            return a.playState === 'running' && iterations !== Infinity;
        });
        const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));
        for (let round = 0; round < 50; round++) {
            const now = running();
            if (now.length === 0) {
                await frame();
                if (running().length === 0) return;
                continue;
            }
            await Promise.all(now.map((a) => a.finished.catch(() => undefined)));
        }
    });
}

export interface GatedViolation {
    id: string;
    impact: string | null | undefined;
    description: string;
    nodes: Array<{ target: string; summary: string | undefined }>;
}

/** Scan, and return only what the gate cares about — shaped so a failure is readable. */
export async function gatedViolations(page: Page): Promise<GatedViolation[]> {
    await settleTransitions(page);
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations
        .filter((v) => v.impact && GATED_IMPACTS.includes(v.impact))
        .map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            // The summary names the exact attribute/child that is missing, which is
            // what makes a failure actionable instead of a puzzle.
            nodes: v.nodes.slice(0, 3).map((n) => ({
                target: n.target.join(' '),
                summary: n.failureSummary?.replace(/\s+/g, ' ').slice(0, 300),
            })),
        }));
}
