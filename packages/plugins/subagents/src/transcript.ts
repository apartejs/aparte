/**
 * `subagentTranscript` — a sub-agent's conversation under its line.
 *
 * A tool display's `details`: core calls it when the row is drawn and on every update of the
 * call, and leaves in place an element it already holds (so the conversation is never
 * serialised or rewritten per token). It returns the SAME `<aparte-subagent-view>` for one
 * sub-agent of one reply on every call, and hands it the call as it is now: the view patches
 * the rows that changed and nothing else.
 */
import { contextConfig, type AparteConfig, type AparteToolDetails } from '@aparte/core';
import { AparteSubagentView, feedView } from './aparte-subagent-view.js';
import { subagentOf } from './status.js';

/** Views kept for the lines on the page, per config, by reply, segment and sub-agent. */
const views = new WeakMap<AparteConfig, Map<string, AparteSubagentView>>();
/** Past this, the oldest views no row holds are forgotten (rows drawn but never put on the page). */
const MAX_VIEWS = 500;

/**
 * A sub-agent's conversation, for a tool display's `details`: its task, then its text, its
 * reasoning and its own tool rows, drawn by the same renderers as the reply, kept up to date
 * while it works. `''` for a call that opened no sub-agent, and for one that has nothing to
 * show yet — no disclosure until there is.
 *
 * `setupSubagents({ details: 'transcript' })` puts it under every sub-agent's line; register
 * it yourself to put it under one tool's only.
 *
 * @example
 * import { aparteGlobalConfig } from '@aparte/core';
 * import { setupSubagents, subagentTranscript } from '@aparte/plugin-subagents';
 *
 * setupSubagents();
 * aparteGlobalConfig.registerToolDisplay('task', { details: subagentTranscript, open: true });
 */
export const subagentTranscript: AparteToolDetails = (segment) => {
    if (typeof document === 'undefined') return '';
    const sub = subagentOf(segment);
    if (!sub) return '';
    if (!sub.description?.trim() && sub.segments.length === 0) return '';
    const config = contextConfig();
    let byKey = views.get(config);
    if (!byKey) views.set(config, (byKey = new Map()));
    const key = `${segment.messageId ?? ''}\u0000${segment.id}\u0000${sub.id}`;
    let view = byKey.get(key);
    if (!view) {
        view = document.createElement('aparte-subagent-view') as AparteSubagentView;
        const held = view;
        const map = byKey;
        feedView(view, segment, config, () => { if (map.get(key) === held) map.delete(key); });
        map.set(key, view);
        if (map.size > MAX_VIEWS) {
            for (const [k, v] of map) {
                if (map.size <= MAX_VIEWS) break;
                if (!v.isConnected) map.delete(k);
            }
        }
        return view;
    }
    feedView(view, segment, config);
    return view;
};
