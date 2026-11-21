/**
 * `createSegmentList({ segments, paused })`: a saved list taken up as a pause keeps its waiting calls.
 *
 * A list handed over is history, and a call still waiting for an approval in it is aborted: the
 * page that awaited the answer is gone. A sub-agent saved while it waited is not history but a
 * pause, resumed now; adopted as history, the call that opened a sub-agent under it read Stopped,
 * and the resume could not take that sub-agent up on it.
 */
import { describe, it, expect } from 'vitest';
import { createSegmentList } from '../segment-list.js';
import type { AparteSegment } from '../../types/index.js';

const saved: AparteSegment[] = [
    { id: 'tool-c2', type: 'tool_call', status: 'awaiting-approval', toolCall: { id: 'c2', name: 'delegate', input: {} } } as AparteSegment,
    { id: 'tool-c3', type: 'tool_call', status: 'pending', toolCall: { id: 'c3', name: 'read_file', input: {} } } as AparteSegment,
];
const statuses = (segments: readonly AparteSegment[]) => segments.map((s) => (s as { status?: string }).status);

describe('a saved segment list', () => {
    it('adopted as history, aborts the calls that were open', () => {
        expect(statuses(createSegmentList({ messageId: 'm', segments: saved }).segments)).toEqual(['aborted', 'aborted']);
    });

    it('resumed as a pause, keeps a call waiting for an approval open; a running one still stops', () => {
        expect(statuses(createSegmentList({ messageId: 'm', segments: saved, paused: true }).segments)).toEqual(['awaiting-approval', 'aborted']);
    });
});
