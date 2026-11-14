import type { AgUiMessage } from './wire.js';

type Assistant = Extract<AgUiMessage, { role: 'assistant' }>;

/**
 * What the runner keeps of one sub-agent of a run, so a run that pauses can hand it back on
 * its resume. The page's history holds the reply's words, never a sub-agent's: its line draws
 * them, the transcript the model reads does not. But the agent that paused needs them to
 * continue — TanStack AI resumes a paused sub-agent only from its own messages, found after the
 * last user message, tagged with its `subagentRunId` — so the runner records them itself.
 */
export interface SubagentRecord {
    id: string;
    name: string;
    description?: string;
    parentToolCallId?: string;
    parentSubagentRunId?: string;
    status: 'running' | 'finished' | 'error' | 'suspended';
    /** The interrupts it paused on, from its `SUBAGENT_FINISHED` outcome. */
    interruptIds?: string[];
    /** The metadata its `SUBAGENT_STARTED` carried: a TanStack AI router's plan rides there. */
    metadata?: Record<string, unknown>;
    /**
     * Run by TanStack AI: the stream it came in tagged its events with `metadata.tanstack`
     * (TanStack puts it on its runs, calls and plans — not on an agent tool's `SUBAGENT_STARTED`,
     * so the sub-agent's own announcement cannot say). Only such a sub-agent's messages go back
     * on a resume — TanStack needs them; another AG-UI agent keeps its sub-agents' work itself.
     */
    tanstack?: true;
    /** What it wrote and ran, as AG-UI messages: its text, its calls, their results. */
    messages: AgUiMessage[];
}

/** The sub-agents of a run as they stream, carried over from the ticket of the run it resumes. */
export function createSubagentHistory(from: readonly SubagentRecord[] = []) {
    const records = new Map<string, SubagentRecord>(from.map((r) => [r.id, JSON.parse(JSON.stringify(r)) as SubagentRecord]));
    const record = (id: string): SubagentRecord => {
        let at = records.get(id);
        if (!at) {
            at = { id, name: 'subagent', status: 'running', messages: [] };
            records.set(id, at);
        }
        return at;
    };
    const assistantCall = (owner: string, toolCallId: string) => {
        for (const m of record(owner).messages) {
            if (m.role !== 'assistant') continue;
            const call = m.toolCalls?.find((c) => c.id === toolCallId);
            if (call) return call;
        }
        return undefined;
    };
    return {
        /** Announced (again, by a resumed run: the same invocation going on). */
        start(id: string, info: Omit<SubagentRecord, 'id' | 'status' | 'messages' | 'interruptIds' | 'tanstack'>): void {
            const at = record(id);
            Object.assign(at, info);
            at.status = 'running';
            delete at.interruptIds;
        },
        end(id: string, status: SubagentRecord['status'], interruptIds?: string[]): void {
            const at = record(id);
            at.status = status;
            if (interruptIds?.length) at.interruptIds = interruptIds;
            else delete at.interruptIds;
        },
        text(owner: string, messageId: string, delta: string): void {
            const messages = record(owner).messages;
            let at = messages.find((m): m is Assistant => m.role === 'assistant' && m.id === messageId);
            if (!at) {
                at = { id: messageId, role: 'assistant', content: '' };
                messages.push(at);
            }
            at.content = (at.content ?? '') + delta;
        },
        /** A call joins the assistant message that ends the transcript, as one model step writes text then calls. */
        call(owner: string, toolCallId: string, name: string): void {
            const known = assistantCall(owner, toolCallId);
            if (known) {
                if (name) known.function.name = name;
                return;
            }
            const messages = record(owner).messages;
            const last = messages.at(-1);
            let host: Assistant;
            if (last?.role === 'assistant') {
                host = last;
            } else {
                host = { id: `${toolCallId}:call`, role: 'assistant' };
                messages.push(host);
            }
            host.toolCalls = [...(host.toolCalls ?? []), { id: toolCallId, type: 'function', function: { name, arguments: '' } }];
        },
        args(owner: string, toolCallId: string, delta: string): void {
            const call = assistantCall(owner, toolCallId);
            if (call) call.function.arguments += delta;
        },
        result(owner: string, messageId: string | undefined, toolCallId: string, content: string): void {
            record(owner).messages.push({ id: messageId ?? `${toolCallId}:result`, role: 'tool', toolCallId, content });
        },
        /** The run's sub-agents, `tanstack` set on each when the run was TanStack AI's. */
        records(tanstack = false): SubagentRecord[] {
            return [...records.values()].map((r) => (tanstack ? { ...r, tanstack: true as const } : r));
        },
    };
}

/**
 * The sub-agents of a paused run as the messages its resume sends: each one's own, tagged with
 * its `subagentRunId` (AG-UI 1.0 lets a message carry one), the first carrying TanStack AI's
 * card for it — `metadata.tanstack.subagent`: name, status, the interrupts it waits on, its
 * `SUBAGENT_STARTED` metadata — which is what TanStack reads to know which sub-agent an answer
 * is for, and which of them had already finished (those it does not run again).
 *
 * Only the sub-agents TanStack announced (`tanstack`): no other agent reads them. `answers` are
 * the page's answers to calls the agent left to the browser, by call id: one a sub-agent made
 * joins its messages, after the run of messages that declares and answers its step — tagged
 * like them, never ahead of the call it answers.
 */
export function subagentMessages(records: readonly SubagentRecord[], answers: ReadonlyMap<string, AgUiMessage> = new Map()): AgUiMessage[] {
    return records.filter((r) => r.tanstack).flatMap((r) => withAnswers(r.messages, answers).map((m, i): AgUiMessage => {
        if (m.role !== 'assistant' && m.role !== 'tool') return m;
        const card = i === 0
            ? {
                metadata: {
                    tanstack: {
                        subagent: {
                            name: r.name,
                            status: r.status,
                            ...(r.description !== undefined ? { description: r.description } : {}),
                            ...(r.parentToolCallId !== undefined ? { parentToolCallId: r.parentToolCallId } : {}),
                            ...(r.parentSubagentRunId !== undefined ? { parentSubagentRunId: r.parentSubagentRunId } : {}),
                            ...(r.interruptIds ? { interruptIds: r.interruptIds } : {}),
                            ...(r.metadata ? { metadata: r.metadata } : {}),
                        },
                    },
                },
            }
            : {};
        return { ...m, subagentRunId: r.id, ...card };
    }));
}

/** A sub-agent's messages with the page's answers to its calls placed after the step that declares them. */
function withAnswers(messages: readonly AgUiMessage[], answers: ReadonlyMap<string, AgUiMessage>): AgUiMessage[] {
    if (answers.size === 0) return [...messages];
    const out: AgUiMessage[] = [];
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i]!;
        out.push(m);
        if (m.role !== 'assistant' || !m.toolCalls?.length) continue;
        // After the results the step already has: they answer the same assistant message.
        while (messages[i + 1]?.role === 'tool') out.push(messages[++i]!);
        for (const call of m.toolCalls) {
            const answer = answers.get(call.id);
            if (answer) out.push(answer);
        }
    }
    return out;
}
