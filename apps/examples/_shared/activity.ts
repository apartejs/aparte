/**
 * An agent's activity, drawn by a renderer the site registers: the scripted model reports how
 * many sources it has read, the same activity sent again as it reads, and the reply shows ONE
 * line for it, updated in place — "Read 1 of 3 sources", then 2, then 3.
 *
 * The type (`search-progress`) is the site's own vocabulary, as an agent's would be: core draws
 * an activity only through the renderer registered for its type, and draws nothing without one.
 */
import { aparteGlobalConfig, type AparteActivitySegment } from '@aparte/core';
import type { Scenario } from '@aparte/provider-scenario';

/** What the path is asked with: the browser suite's prompt. */
export const ACTIVITY_PROMPT = 'Read the sources and show your progress.';

/** The activity's type, the key its renderer is registered under. */
export const ACTIVITY_TYPE = 'search-progress';

interface SearchProgress { read: number; of: number }

const progress = (read: number) => ({ activity: { type: ACTIVITY_TYPE, id: 'sources', content: { read, of: 3 } satisfies SearchProgress } });

export const ACTIVITY_SCENARIOS: Record<string, Scenario> = {
    activity: {
        when: /\bshow your progress\b/i,
        turn: [
            progress(0),
            { wait: 500 },
            progress(1),
            { wait: 500 },
            progress(2),
            { wait: 500 },
            progress(3),
            { text: 'All three sources agree: the release is ready.' },
        ],
    },
};

const sentence = (segment: AparteActivitySegment): string => {
    const { read, of } = segment.content as SearchProgress;
    return `Read ${read} of ${of} sources`;
};

/** Draw the `search-progress` activity: one line, patched in place each time it changes. */
export function setupActivity(): void {
    aparteGlobalConfig.registerActivityRenderer(ACTIVITY_TYPE, {
        render: (segment) => {
            const line = document.createElement('p');
            line.className = 'search-progress';
            line.textContent = sentence(segment);
            return line;
        },
        update: (line, segment) => {
            line.textContent = sentence(segment);
        },
    });
}
