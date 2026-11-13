/**
 * An adapter told not to observe calls no observer.
 *
 * A plugin draws a sub-agent by feeding its events, `agentId` taken off, to an adapter of
 * core's own writing a segment list. That adapter called the config's observers too, so an
 * app's observer heard every sub-agent event twice — the second time unattributed, as if it
 * were the reply's own, and an app metering "the reply's text" with `agentId == null` counted
 * the sub-agent's words. The events reached the observers once already, from the reply's
 * adapter: a lane's adapter is made with `observe: false`.
 *
 * An option, not a mark on every list: an app may write a reply of its own into a segment
 * list, and that run must be heard as any other.
 */
import { describe, it, expect } from 'vitest';
import { AparteConfig } from '../../config/aparte-config.js';
import { createStreamAdapter, type AparteStreamRunEvent, type StreamAdapterTarget } from '../stream-adapter.js';
import { createSegmentList } from '../../utils/segment-list.js';

/** A reply target that holds nothing: what the reply's adapter writes is not under test. */
const replyTarget = (): StreamAdapterTarget => ({ addSegment: () => {}, updateSegment: () => {}, dispatchEvent: () => true });

describe('an adapter made with observe: false', () => {
    it('calls no observer: an attributed event is heard once, with its agentId, and the lane is written', () => {
        const config = new AparteConfig();
        const list = createSegmentList({ messageId: 'm1', config });
        const lane = createStreamAdapter({ target: list, config, messageId: 'm1', observe: false });
        const heard: AparteStreamRunEvent[] = [];
        // What the plugin does: hear the sub-agent's event, feed it to the lane without its id.
        config.observeRunEvents((e) => {
            heard.push(e);
            const { agentId, ...own } = e as AparteStreamRunEvent & { agentId?: string };
            if (agentId !== undefined) lane(own as AparteStreamRunEvent);
        });
        const reply = createStreamAdapter({ target: replyTarget(), config, messageId: 'm1' });

        reply({ type: 'turn-start', agentId: 'a1' });
        reply({ type: 'text-delta', delta: 'From the child.', agentId: 'a1' });
        reply({ type: 'text-flush', agentId: 'a1' });

        expect(heard).toEqual([
            { type: 'turn-start', agentId: 'a1' },
            { type: 'text-delta', delta: 'From the child.', agentId: 'a1' },
            { type: 'text-flush', agentId: 'a1' },
        ]);
        expect(list.segments.map((s) => (s as { content?: string }).content)).toEqual(['From the child.']);
    });

    it('and is never taken for unheard: a sub-agent event fed to it warns nothing', () => {
        const warn: unknown[] = [];
        const original = console.warn;
        console.warn = (...args: unknown[]) => { warn.push(args); };
        try {
            const lane = createStreamAdapter({ target: createSegmentList({ messageId: 'm1' }), config: new AparteConfig(), messageId: 'm1', observe: false });
            lane({ type: 'text-delta', delta: 'nested', agentId: 'a2' });
            expect(warn).toEqual([]);
        } finally {
            console.warn = original;
        }
    });

    it('by default an adapter writing a segment list is observed, as any reply', () => {
        const config = new AparteConfig();
        const heard: string[] = [];
        config.observeRunEvents((e) => { heard.push(e.type); });
        const list = createSegmentList({ messageId: 'm1' });
        const emit = createStreamAdapter({ target: list, config, messageId: 'm1' });
        emit({ type: 'turn-start' });
        emit({ type: 'text-delta', delta: 'x' });
        expect(heard).toEqual(['turn-start', 'text-delta']);
    });
});
