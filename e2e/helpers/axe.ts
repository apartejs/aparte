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
 */
export async function settleTransitions(page: Page): Promise<void> {
    await page.evaluate(() => Promise.all(
        document.getAnimations()
            .filter((a) => {
                const iterations = (a.effect as KeyframeEffect | null)?.getTiming?.().iterations;
                return a.playState === 'running' && iterations !== Infinity;
            })
            .map((a) => a.finished.catch(() => undefined)),
    ));
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
