/**
 * `?harness=nested-rows&subagent-transcript`: tool rows INSIDE a tool row, every way a line and
 * the calls under it can be, drawn straight into the transcript, with no model and no timing.
 * `e2e/tests/nested-rows.spec.ts` reads it.
 *
 * Core's cascade is the subject. A rule keyed on a row's state must reach that row's own line
 * and nothing under it. A sub-agent's conversation under its line (`@aparte/plugin-subagents`,
 * `details: 'transcript'`) is where a row holds rows. Each message is one line, in one state,
 * quiet or not, whose sub-agent made one call of each state, quiet or not. One more message
 * holds the same calls drawn on their own: the reference each nested call must look like.
 *
 * A last message is still being written (with `&caret`), its own text after a line whose
 * sub-agent wrote text too: one caret, the reply's, never one per paragraph of the transcript.
 *
 * Ids say what a row is, for the spec: `ref:<child>`, `nested:<parent>:<child>`, where a key
 * is `<state>-<quiet|loud>`.
 */
import { aparteGlobalConfig, type AparteMessage, type AparteSegment, type AparteToolCallSegment } from '@aparte/core';

const STATES = ['pending', 'resolved', 'failed', 'rejected', 'aborted', 'awaiting-approval', 'queued'] as const;
type State = (typeof STATES)[number];

/** The harness's own two tools: one drawn quiet (core's default), one not. */
const QUIET = 'harness_quiet';
const LOUD = 'harness_loud';
const KINDS = [['quiet', QUIET], ['loud', LOUD]] as const;

function call(id: string, name: string, state: State): AparteToolCallSegment {
    const done = state === 'resolved' || state === 'failed' || state === 'rejected' || state === 'aborted';
    return {
        id,
        type: 'tool_call',
        toolCall: { id: `call-${id}`, name, input: { path: 'notes.md' } },
        status: state === 'queued' ? 'pending' : state,
        ...(state === 'queued' ? { queued: true } : {}),
        ...(done ? { result: state === 'failed' ? "ENOENT: no such file, open 'notes.md'" : 'ok' } : {}),
    } as AparteToolCallSegment;
}

/** Every call a sub-agent can have made: each state, quiet and not. */
function children(prefix: string): AparteToolCallSegment[] {
    return STATES.flatMap((state) => KINDS.map(([kind, name]) => call(`${prefix}${state}-${kind}`, name, state)));
}

function message(id: string, segments: AparteSegment[], streaming = false): AparteMessage {
    return {
        id,
        role: 'assistant',
        timestamp: Date.now(),
        segments,
        ...(streaming ? { isStreaming: true, status: 'streaming' as const } : { status: 'completed' as const }),
    };
}

/** Draw the harness into the page's transcript, when the URL asks for it. */
export function mountNestedRowsHarness(): void {
    if (new URLSearchParams(location.search).get('harness') !== 'nested-rows') return;
    // Open, so what is under each line is laid out and seen, as a reader who opened it sees it.
    aparteGlobalConfig.registerToolDisplay(QUIET, { label: 'Quiet call', open: true });
    aparteGlobalConfig.registerToolDisplay(LOUD, { label: 'Loud call', quiet: false, open: true });

    const viewport = document.querySelector('aparte-chat-viewport') as (HTMLElement & { appendMessage(m: AparteMessage): void }) | null;
    if (!viewport) return;

    viewport.appendMessage(message('harness-ref', children('ref:')));
    for (const state of STATES) {
        for (const [kind, name] of KINDS) {
            const parent = `${state}-${kind}`;
            const line = call(`line:${parent}`, name, state);
            (line as AparteToolCallSegment & { subagent: unknown }).subagent = {
                id: `agent-${parent}`,
                name: `Agent ${parent}`,
                description: 'Read the notes',
                status: state === 'pending' || state === 'awaiting-approval' || state === 'queued' ? 'running' : 'done',
                segments: children(`nested:${parent}:`),
            };
            viewport.appendMessage(message(`harness-${parent}`, [line]));
        }
    }

    // `&deep` (with `&subagent-view`): the calls under each line are SUB-AGENT lines, each with a
    // conversation of its own and an Open button, so each wraps its disclosure beside the button.
    // That shape has rules of its own (`> .aparte-tool-disclosure > …`), and none reached a line
    // under a line until a call was nested this way.
    if (new URLSearchParams(location.search).has('deep')) {
        for (const state of STATES) {
            for (const [kind, name] of KINDS) {
                const parent = `${state}-${kind}`;
                const line = call(`line:deep-${parent}`, name, state);
                const nested = children(`deep:${parent}:`).map((child, n) => {
                    (child as AparteToolCallSegment & { subagent: unknown }).subagent = {
                        id: `agent-deep-${parent}-${n}`,
                        name: `Helper ${n}`,
                        description: 'Check one file',
                        status: child.status === 'pending' || child.status === 'awaiting-approval' ? 'running' : child.status === 'resolved' ? 'done' : 'failed',
                        segments: [{ id: `deep-text-${parent}-${n}`, type: 'text', content: 'Checked.' } as AparteSegment],
                    };
                    return child;
                });
                (line as AparteToolCallSegment & { subagent: unknown }).subagent = {
                    id: `agent-deep-${parent}`,
                    name: `Lead ${parent}`,
                    description: 'Split the checks',
                    status: state === 'pending' || state === 'awaiting-approval' || state === 'queued' ? 'running' : 'done',
                    segments: nested,
                };
                viewport.appendMessage(message(`harness-deep-${parent}`, [line]));
            }
        }
    }

    // A reply still being written: a line whose sub-agent wrote two paragraphs, then the
    // reply's own words.
    const writer = call('line:caret', QUIET, 'pending');
    (writer as AparteToolCallSegment & { subagent: unknown }).subagent = {
        id: 'agent-caret',
        name: 'Writer',
        description: 'Draft the notes',
        status: 'running',
        segments: [
            { id: 'caret-sub-1', type: 'text', content: 'The first file is there.' },
            { id: 'caret-sub-2', type: 'text', content: 'The second one is missing.' },
        ],
    };
    viewport.appendMessage(message('harness-caret', [writer, { id: 'caret-own', type: 'text', content: 'Checking the notes now' } as AparteSegment], true));
}
