/**
 * The modes, the classes, and the table that joins them.
 *
 * A MODE is what the person switches ("plan", "auto"); a CLASS is what a tool does
 * (`read`, `write`, `exec`), declared by the host on ITS tool names — the names are
 * wire format the host owns, and no library can know that `run_command` executes and
 * `search_docs` reads. The table below is the whole policy: nine cells, no
 * configuration, so a consumer can read it in one glance and predict every ruling.
 *
 * Nothing here executes anything, remembers anything, or draws anything: it is a pure
 * function from (mode, class, call) to a ruling core already knows how to honour.
 */
import type { AparteApprovalPolicy, AparteApprovalRuling, AparteToolCall } from '@aparte/core';

/**
 * `plan` runs read-only tools and refuses the rest with a sentence the model reads;
 * `ask` asks before every write or execution; `auto-edit` lets writes through and asks
 * before an execution; `auto` never asks.
 */
export type ApprovalMode = 'plan' | 'ask' | 'auto-edit' | 'auto';

/** The four modes, in the order a switch presents them. */
export const APPROVAL_MODES: readonly ApprovalMode[] = ['plan', 'ask', 'auto-edit', 'auto'];

/** What a tool does — the axis the modes decide on. */
export type ToolClass = 'read' | 'write' | 'exec';

/** A tool name, exactly, or a pattern over names. */
export type ToolMatcher = string | RegExp;

/**
 * The host's tool names, by what they do. A name in no list is UNCLASSIFIED: its
 * own `needsApproval` decides (and `auto` still lets it through — auto is auto).
 */
export interface ApprovalClassification {
    read?: readonly ToolMatcher[];
    write?: readonly ToolMatcher[];
    exec?: readonly ToolMatcher[];
}

const matches = (name: string, m: ToolMatcher): boolean =>
    typeof m === 'string' ? m === name : m.test(name);

/** The class of a tool name under a classification, or `undefined` when it is in no list. */
export function classifyTool(name: string, classification: ApprovalClassification): ToolClass | undefined {
    if (classification.exec?.some((m) => matches(name, m))) return 'exec';
    if (classification.write?.some((m) => matches(name, m))) return 'write';
    if (classification.read?.some((m) => matches(name, m))) return 'read';
    return undefined;
}

const NOUN: Record<ToolClass, string> = { read: 'reads', write: 'changes files or state', exec: 'runs a command' };

/**
 * The ruling for one call, from the table. `undefined` means "no opinion" — the tool's
 * own `needsApproval` decides, which is what core does when a policy says nothing.
 */
export function rulingFor(mode: ApprovalMode, cls: ToolClass | undefined, call: AparteToolCall): AparteApprovalRuling | undefined {
    if (mode === 'auto') return { verdict: 'allow' };
    if (cls === undefined) return undefined;
    if (cls === 'read') return { verdict: 'allow' };
    if (mode === 'plan') {
        return {
            verdict: 'deny',
            reason: `Plan mode: \`${call.name}\` ${NOUN[cls]}, and only read-only tools run in this mode. ` +
                'Describe what you would do instead; the user can switch the mode to let you do it.',
        };
    }
    if (mode === 'auto-edit') return cls === 'write' ? { verdict: 'allow' } : { verdict: 'ask' };
    return { verdict: 'ask' };
}

/**
 * A core `AparteApprovalPolicy` that reads the CURRENT mode on every call — so a
 * switch flipped mid-run applies to the next tool call, not the next conversation.
 */
export function createApprovalPolicy(getMode: () => ApprovalMode, classification: ApprovalClassification): AparteApprovalPolicy {
    return (call) => rulingFor(getMode(), classifyTool(call.name, classification), call);
}
