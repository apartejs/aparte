/**
 * `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA` reach the page as `activity` run events carrying the
 * activity's WHOLE content: the runner applies a delta's JSON Patch to what it holds and hands
 * on the result, so nothing past it ever patches. They were verified, then dropped.
 *
 * What AG-UI 1.0 says, and the corpus pins (`activity-*.json`): a snapshot overwrites unless
 * it says `replace: false`, which leaves an existing activity as it stands — content and type;
 * a delta for an activity never created is skipped (a warning, never a failure).
 */
import { describe, it, expect } from 'vitest';
import { agUi, finished, scripted, sse, started, turn } from './replay.js';

const activities = (events: { type: string }[]) => events.filter((e) => e.type === 'activity');

describe('an activity reaches the page whole', () => {
    it('a snapshot, then a delta applied to it, each as the whole content', async () => {
        const f = scripted(sse(
            started(),
            { type: 'ACTIVITY_SNAPSHOT', messageId: 'a1', activityType: 'search-progress', content: { read: 0, of: 5 } },
            { type: 'ACTIVITY_DELTA', messageId: 'a1', activityType: 'search-progress', patch: [{ op: 'replace', path: '/read', value: 3 }] },
            finished(),
        ));
        const { events, error } = await turn(agUi(f.fetch));
        expect(error).toBeUndefined();
        expect(activities(events)).toEqual([
            { type: 'activity', id: 'a1', activityType: 'search-progress', content: { read: 0, of: 5 } },
            { type: 'activity', id: 'a1', activityType: 'search-progress', content: { read: 3, of: 5 } },
        ]);
    });

    it('a snapshot replaces what was there, unless it says replace: false', async () => {
        const f = scripted(sse(
            started(),
            { type: 'ACTIVITY_SNAPSHOT', messageId: 'a1', activityType: 'web_search', content: { found: 1 } },
            { type: 'ACTIVITY_SNAPSHOT', messageId: 'a1', activityType: 'web_search', content: { found: 2 } },
            { type: 'ACTIVITY_SNAPSHOT', messageId: 'a1', activityType: 'file_search', content: { found: 9 }, replace: false },
            // Not there yet: a replace: false snapshot is how it starts.
            { type: 'ACTIVITY_SNAPSHOT', messageId: 'a2', activityType: 'web_search', content: { found: 4 }, replace: false },
            finished(),
        ));
        const { events } = await turn(agUi(f.fetch));
        expect(activities(events)).toEqual([
            { type: 'activity', id: 'a1', activityType: 'web_search', content: { found: 1 } },
            { type: 'activity', id: 'a1', activityType: 'web_search', content: { found: 2 } },
            { type: 'activity', id: 'a2', activityType: 'web_search', content: { found: 4 } },
        ]);
    });

    it('a delta for an activity never created is skipped with a warning, and the run goes on', async () => {
        const warnings: string[] = [];
        const f = scripted(sse(
            started(),
            { type: 'ACTIVITY_DELTA', messageId: 'ghost', activityType: 'web_search', patch: [{ op: 'replace', path: '/found', value: 3 }] },
            { type: 'TEXT_MESSAGE_START', messageId: 'm', role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: 'Still here.' },
            { type: 'TEXT_MESSAGE_END', messageId: 'm' },
            finished(),
        ));
        const { events, error } = await turn(agUi(f.fetch, { onWarning: (w) => { warnings.push(w); } }));
        expect(error).toBeUndefined();
        expect(activities(events)).toEqual([]);
        expect(events.some((e) => e.type === 'text-delta')).toBe(true);
        expect(warnings).toEqual([expect.stringContaining('"ghost"')]);
    });

    it('a delta that cannot apply leaves the activity as it was, and nothing is sent again', async () => {
        const warnings: string[] = [];
        const f = scripted(sse(
            started(),
            { type: 'ACTIVITY_SNAPSHOT', messageId: 'a1', activityType: 'web_search', content: { found: 1 } },
            { type: 'ACTIVITY_DELTA', messageId: 'a1', activityType: 'web_search', patch: [{ op: 'replace', path: '/missing/deep', value: 3 }] },
            { type: 'ACTIVITY_DELTA', messageId: 'a1', activityType: 'web_search', patch: [{ op: 'add', path: '/more', value: true }] },
            finished(),
        ));
        const { events } = await turn(agUi(f.fetch, { onWarning: (w) => { warnings.push(w); } }));
        expect(activities(events)).toEqual([
            { type: 'activity', id: 'a1', activityType: 'web_search', content: { found: 1 } },
            { type: 'activity', id: 'a1', activityType: 'web_search', content: { found: 1, more: true } },
        ]);
        expect(warnings).toEqual([expect.stringContaining('Failed to apply activity patch')]);
    });

    it('a sub-agent\'s activity carries its id, and its delta stays its own', async () => {
        const f = scripted(sse(
            started(),
            { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'researcher' },
            { type: 'ACTIVITY_SNAPSHOT', messageId: 'a1', activityType: 'search-progress', content: { read: 0 }, subagentRunId: 's1' },
            { type: 'ACTIVITY_DELTA', messageId: 'a1', activityType: 'search-progress', patch: [{ op: 'replace', path: '/read', value: 2 }] },
            { type: 'SUBAGENT_FINISHED', subagentRunId: 's1' },
            finished(),
        ));
        const { events, error } = await turn(agUi(f.fetch));
        expect(error).toBeUndefined();
        expect(activities(events)).toEqual([
            { type: 'activity', id: 'a1', activityType: 'search-progress', content: { read: 0 }, agentId: 's1' },
            { type: 'activity', id: 'a1', activityType: 'search-progress', content: { read: 2 }, agentId: 's1' },
        ]);
    });

    it('the content handed on is a copy: patching it later does not reach an event already sent', async () => {
        const f = scripted(sse(
            started(),
            { type: 'ACTIVITY_SNAPSHOT', messageId: 'a1', activityType: 'list', content: { items: ['a'] } },
            { type: 'ACTIVITY_DELTA', messageId: 'a1', activityType: 'list', patch: [{ op: 'add', path: '/items/-', value: 'b' }] },
            finished(),
        ));
        const { events } = await turn(agUi(f.fetch));
        const [first, second] = activities(events) as unknown as { content: { items: string[] } }[];
        expect(first!.content.items).toEqual(['a']);
        expect(second!.content.items).toEqual(['a', 'b']);
    });
});
