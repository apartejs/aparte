/**
 * The research threads in the sidebar, as a store would return them: each with its messages,
 * tool calls and their results included, so a finished thread opens exactly as it ended, report
 * and all. Written by hand rather than stored; the dates are relative to now so the list's
 * "Today / Yesterday" groups stay true.
 */
import type { AparteConversation, AparteMessage, AparteSegment, AparteUsage } from '@aparte/core';
import { ANSWER, PLAN, PLAY_QUESTION, READING, READS, REPORT, REPORT_TITLE, RUN_USAGE, SEARCHES, STARTING } from './scenario';
import { pageContent, searchContent, searchResult } from './tools';

const MINUTE = 6e4;
const HOUR = 36e5;
const DAY = 864e5;
const now = Date.now();

let seq = 0;
const id = (prefix: string): string => `${prefix}${++seq}`;

const user = (content: string, at: number, extra: Partial<AparteMessage> = {}): AparteMessage =>
    ({ id: id('u'), role: 'user', content, timestamp: at, ...extra });

const assistant = (segments: AparteSegment[], at: number, usage?: AparteUsage): AparteMessage =>
    ({ id: id('a'), role: 'assistant', segments, timestamp: at, ...(usage ? { usage } : {}) });

const text = (content: string): AparteSegment => ({ id: id('s'), type: 'text', content });

function call(name: string, input: Record<string, unknown>, result: string, structuredResult?: unknown): AparteSegment {
    const callId = id('t');
    return {
        id: id('s'),
        type: 'tool_call',
        status: 'resolved',
        toolCall: { id: callId, name, input },
        result,
        ...(structuredResult === undefined ? {} : { structuredResult }),
    };
}

function report(title: string, content: string): AparteSegment {
    const input = { mimeType: 'text/markdown', title, content };
    return call('create_artifact', input, `Artifact created: ${title} (text/markdown).`, input);
}

const usage = (inputTokens: number, outputTokens: number): AparteUsage =>
    ({ inputTokens, outputTokens, totalTokens: inputTokens + outputTokens });

const conversation = (cid: string, title: string, updatedAt: number, messages: AparteMessage[]): AparteConversation =>
    ({ id: cid, title, createdAt: messages[0]?.timestamp ?? updatedAt, updatedAt, messages });

// ─── The bike-share study: the run the showcase plays, finished ──────────────

const wheelsAt = now - 40 * MINUTE;

export const WHEELS_ID = 'r-wheels';

const wheels = conversation(WHEELS_ID, 'Merrow Wheels, year one', wheelsAt, [
    user(PLAY_QUESTION, wheelsAt - 2 * MINUTE),
    assistant([
        // The plan's timing, as the stream measured it: the label reads "Thought for 2.4s".
        { id: id('s'), type: 'thinking', content: PLAN, isStreaming: false, meta: { aparte: { startedAt: wheelsAt - 110e3, endedAt: wheelsAt - 107.6e3 } } },
        text(STARTING),
        ...SEARCHES.map((query) => {
            const result = searchResult(query);
            return call('web_search', { query }, searchContent(result), result);
        }),
        text(READING),
        ...READS.map((url) => call('read_page', { url }, pageContent(url))),
        report(REPORT_TITLE, REPORT),
        text(ANSWER),
    ], wheelsAt, RUN_USAGE),
]);

// ─── The night bus review: long enough that its start was summarised ─────────

const NIGHT_REVIEW = 'https://transit.portmerrow.example.org/reports/night-network-six-months';
const NIGHT_SURVEY = 'https://nightworkers.example.org/surveys/getting-home-2026';

const NIGHT_REPORT = `# Night network: six months on

Desk research · Port Merrow, October 2025 – March 2026 · *Illustrative data about a fictional city*

## Summary

Six months after the redesign, the four frequent night lines carry **25% more boardings per hour** than the six routes they replaced [[1](${NIGHT_REVIEW})]. Three of the four beat their target; N30 is the one below it [[1](${NIGHT_REVIEW})]. Night workers report shorter waits but longer walks to a stop [[2](${NIGHT_SURVEY})].

## Boardings per hour, by line

| Line | Before | After | Target |
| --- | --- | --- | --- |
| N10 Harbourside – Airport | 31 | 42 | 38 |
| N20 Old Town loop | 27 | 34 | 32 |
| N30 Kestrel Hill – Fenwick | 22 | 24 | 30 |
| N40 Saltmarsh – Centre | 18 | 23 | 22 |

## Caveats

- "Before" is the old route that covered most of each new line's stops, not an exact match.
- The workers' survey was self-selected: 410 replies, mostly from hospital and port staff [[2](${NIGHT_SURVEY})].

## Sources

1. [Night network: six-month review](${NIGHT_REVIEW}) — Port Merrow Transit Authority
2. [Getting home after midnight: a survey of night workers](${NIGHT_SURVEY}) — Port Merrow Night Workers' Association
`;

const nightAt = now - DAY - 3 * HOUR;

const night = conversation('r-night', 'Night bus network review', nightAt, [
    // What @aparte/plugin-compaction leaves when a conversation outgrows its window: one
    // summary in place of the turns it replaced, drawn as a notice.
    user(
        '**Conversation summary**\n\nThe user is reviewing Port Merrow\'s night buses six months after the October 2025 redesign, '
        + 'which replaced six routes with four frequent lines (N10–N40). Read so far: the operator\'s six-month review, the open '
        + 'boardings data and a night workers\' survey. Agreed: compare boardings per hour, not totals, and flag that the survey was self-selected.',
        nightAt - 50 * MINUTE,
        { compaction: true },
    ),
    assistant([text('Picking up from the summary: boardings per hour is the fair comparison, since the new network runs fewer, longer lines. Shall I draft the report now?')], nightAt - 48 * MINUTE),
    user('Yes. Keep it to one page, with the per-line numbers in a table.', nightAt - 47 * MINUTE),
    assistant([
        call('read_page', { url: NIGHT_REVIEW }, 'Night network: six-month review\n\nBoardings per hour by line, before and after, with targets.'),
        report('Night network: six months on', NIGHT_REPORT),
        text(`**Night network: six months on** is in the pane. Boardings per hour are up 25% across the four lines; N30 is the one below its target [[1](${NIGHT_REVIEW})].`),
    ], nightAt - 45 * MINUTE),
    user('What would it take to run N30 every 15 minutes instead of 20?', nightAt - 6 * MINUTE),
    assistant([text(
        `At 20 minutes N30 runs with four buses; at 15 it needs five, so one more bus and two more drivers a night, about 2,600 extra vehicle-hours a year [[1](${NIGHT_REVIEW})].\n\n`
        + 'Whether it pays depends on the riders it brings back. The review expects about 9% more boardings from the shorter wait, '
        + 'which would take N30 from 24 to roughly 26 an hour: better, still short of its target of 30.',
    )], nightAt, usage(61400, 820)),
]);

// ─── Two short threads with no report yet ────────────────────────────────────

const CARGO_BRIEF = 'https://urbanmobility.example.org/briefs/cargo-bike-incentives';

const cargoAt = now - 3 * DAY;

const cargo = conversation('r-cargo', 'Cargo-bike subsidy options', cargoAt, [
    user('What are the usual ways a city subsidises cargo bikes?', cargoAt - MINUTE),
    assistant([text(
        `Three shapes come up again and again [[1](${CARGO_BRIEF})]:\n\n`
        + '1. **A purchase grant**, a share of the price up to a cap. Simple, but it mostly reaches households who would have bought one anyway.\n'
        + '2. **A trial scheme**, a bike lent for a month. Cheaper per convert, and it reaches people who have never ridden one.\n'
        + '3. **A business lease**, aimed at deliveries. The largest effect on vans, the slowest to set up.\n\n'
        + 'Want me to research which of these fits Port Merrow, with costs?',
    )], cargoAt, usage(5200, 310)),
]);

const CONSULTATION = 'https://consult.portmerrow.example.org/old-town-loading-bays/responses';

const kerbAt = now - 9 * DAY;

const kerb = conversation('r-kerb', 'Kerbside loading bays', kerbAt, [
    user('Summarise the main objections to the Old Town loading-bay plan.', kerbAt - MINUTE),
    assistant([text(
        'Two objections account for most of the responses: shop owners worry the bays are too far from their doors for heavy deliveries, '
        + `and residents want the evening hours returned to parking [[1](${CONSULTATION})]. A smaller group asks for the bays to double as cargo-bike parking.`,
    )], kerbAt, usage(3900, 140)),
]);

export const THREADS: AparteConversation[] = [wheels, night, cargo, kerb];
