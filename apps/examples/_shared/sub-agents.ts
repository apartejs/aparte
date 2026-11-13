/**
 * The scripted model delegating to sub-agents: three paths, each asked for in so many words.
 *
 * - "Get the release ready with three sub-agents." Three sub-agents side by side, each with
 *   a task of its own and one of the site's read tools, started in the BACKGROUND: the model
 *   goes on working while they look (it searches the docs itself), then waits for them and
 *   answers from what they returned.
 * - "Ask a sub-agent for the last release." One sub-agent: its line is the delegate call's
 *   own row.
 * - "Have a sub-agent run the build." One sub-agent whose `run_command` is gated, so the
 *   approval panel names the sub-agent that asks.
 *
 * The sub-agents call the site's REAL tools (site-setup.ts registers them): the nested loop
 * runs their handlers, and the approval policy rules them as it rules the model's own calls.
 * What runs them is `scenarioSubagentTool` from `@aparte/provider-scenario`; what draws them
 * is `@aparte/plugin-subagents`.
 */
import { contentToText, type AparteChatRequest, type AparteToolCallSegment } from '@aparte/core';
import type { Scenario } from '@aparte/provider-scenario';

/** The tool the delegating steps call: the scenario provider's default name. */
export const DELEGATE = 'delegate';

/** What each path is asked with: the sites' suggestions, and the browser suite's prompts. */
export const SUBAGENT_PROMPTS = {
    team: 'Get the release ready with three sub-agents.',
    one: 'Ask a sub-agent for the last release.',
    gated: 'Have a sub-agent run the build.',
} as const;

/** What the model searches for itself while the three sub-agents work. */
const MEANWHILE_QUERY = 'open release issues';

/** How the loop says that sub-agents started in the background are back. */
const BACK = /sub-agents? you started (is|are) back/i;

/** The first sub-agent of each delegation, which says which answer follows it. */
const LEAD = {
    team: 'Checklist scout',
    one: 'Changelog reader',
    gated: 'Build runner',
} as const;

/**
 * Before the showcase's scenarios when spread into the provider's: the showcase's `release`
 * listens for "release", and the first `when` that matches answers. The gated path is first
 * of these three because its prompt also says "sub-agent".
 */
export const SUBAGENT_SCENARIOS: Record<string, Scenario> = {
    subagentApproval: {
        when: /sub-?agent run the build/i,
        turn: [
            { text: 'Handing the build to a sub-agent.' },
            {
                subagents: [{
                    name: LEAD.gated,
                    task: 'Run the build and report any errors',
                    turns: [
                        [{ thinking: 'A build is `pnpm build` at the root.' }, { tool: 'run_command', input: { cmd: 'pnpm build' } }],
                        // What its command returned decides what it says: a refused call ran nothing.
                        (request) => (refused(request) ? BUILD_REFUSED : 'The build finished in 12.4 s with no errors.'),
                    ],
                }],
            },
        ],
    },
    subagents: {
        when: /\bsub-?agents\b/i,
        turn: [
            { text: 'Three things to check before a release, so three sub-agents: the checklist, the changelog, the versioning rules.' },
            {
                // Started, not waited for: the model goes on while they look.
                background: true,
                subagents: [
                    {
                        name: LEAD.team,
                        task: 'Find what the release checklist asks for',
                        turns: [
                            [{ thinking: 'The checklist is in the docs. Search for it by name.' }, { wait: 1500 }, { tool: 'search_docs', input: { query: 'release checklist' } }],
                            'The checklist asks for a changelog entry and a green build before the publish script runs.',
                        ],
                    },
                    {
                        name: 'Changelog reader',
                        task: 'Find the last release in the changelog',
                        turns: [
                            [{ thinking: 'The newest entry is at the top of CHANGELOG.md.' }, { wait: 2200 }, { tool: 'read_file', input: { path: 'CHANGELOG.md' } }],
                            'The last entry is 0.16.11.',
                        ],
                    },
                    {
                        name: 'Version checker',
                        task: 'Say which version number comes next',
                        turns: [
                            [{ thinking: 'The versioning page says what a feature release bumps.' }, { wait: 2800 }, { tool: 'search_docs', input: { query: 'versioning' } }],
                            'This release adds a feature, so it is a minor bump.',
                        ],
                    },
                ],
            },
        ],
    },
    subagent: {
        when: /\bsub-?agent\b/i,
        turn: [
            { text: 'A sub-agent can look that up.' },
            {
                subagents: [{
                    name: LEAD.one,
                    task: 'Find the last release in the changelog',
                    turns: [
                        [{ thinking: 'The newest entry is at the top of CHANGELOG.md.' }, { wait: 1200 }, { tool: 'read_file', input: { path: 'CHANGELOG.md' } }],
                        'The last entry is 0.16.11.',
                    ],
                }],
            },
        ],
    },

    // While the three work: the model does a part of the job itself, then says it waits.
    subagentsMeanwhile: {
        turn: [
            { text: 'While they look, I check what is still open for this release.' },
            { tool: 'search_docs', input: { query: MEANWHILE_QUERY } },
        ],
    },
    subagentsWaiting: { turn: 'Nothing else is open. Waiting for the three of them.' },

    // What the model says once its sub-agents are back, one per path (`routeDelegation`).
    subagentsDone: {
        turn: 'Ready to cut **0.17.0**: the checklist wants a changelog entry and a green build, the last release was 0.16.11, and a feature release is a minor bump. Say *ship it* and I will write the entry and run the build.',
    },
    subagentDone: { turn: 'The last release was **0.16.11**, so the next one is 0.17.0.' },
    subagentApprovalDone: { turn: 'The build is green: 12.4 s, no errors.' },
    subagentApprovalRefused: { turn: 'The build did not run: its command was refused, so I cannot say whether it passes.' },
    // A delegation no path above wrote (a local model calling the tool on its own).
    delegated: { after: DELEGATE, turn: 'The sub-agents are back; their answers are in the call above.' },
};

/**
 * The answer that follows a delegation, by the first sub-agent the call named: an `after`
 * route keys on WHICH tool ran, and all three paths run the same one. `undefined` for
 * anything else, so the site's own routing goes on.
 */
export function routeDelegation(request: AparteChatRequest): string | undefined {
    const { messages } = request;
    const last = messages[messages.length - 1];
    // The message the loop writes once sub-agents started in the background are back.
    if (last?.role === 'user') return BACK.test(contentToText(last.content)) ? 'subagentsDone' : undefined;
    if (last?.role !== 'tool') return undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
        const call = messages[i]!.toolCalls?.find((c) => c.id === last.toolCallId);
        if (!call) continue;
        // The search the model runs itself while the three work.
        if (call.name === 'search_docs' && call.input['query'] === MEANWHILE_QUERY) return 'subagentsWaiting';
        if (call.name !== DELEGATE) return undefined;
        const lead = leadOf(call.input);
        // Started in the background: the call is answered at once, and the model goes on.
        if (lead === LEAD.team) return 'subagentsMeanwhile';
        if (lead === LEAD.one) return 'subagentDone';
        // The tool result is the sub-agent's last text: it says whether the build ran.
        if (lead === LEAD.gated) return contentToText(last.content).includes(BUILD_REFUSED) ? 'subagentApprovalRefused' : 'subagentApprovalDone';
        return undefined;
    }
    return undefined;
}

/**
 * What a `tool` message says when the call did NOT run: the panel's Reject (with the
 * user's own words, or without), and the approval policy's own refusal — in `plan` mode
 * the sentence `@aparte/plugin-approval` writes. All three are the loop's, not ours; a
 * canned result (site-setup.ts) says none of them.
 */
export const REFUSAL = /rejected by the user|rejected this tool call|refused by the approval policy|Plan mode:/;

/** What the build runner says when its command did not run. */
const BUILD_REFUSED = 'I could not run the build: the command was refused.';

/** Whether the request's last message is a refused call's result. */
function refused(request: AparteChatRequest): boolean {
    const last = request.messages[request.messages.length - 1];
    return last?.role === 'tool' && REFUSAL.test(contentToText(last.content));
}

function leadOf(input: unknown): string | undefined {
    const agents = (input as { agents?: { name?: unknown }[] } | undefined)?.agents;
    const name = Array.isArray(agents) ? agents[0]?.name : undefined;
    return typeof name === 'string' ? name : undefined;
}

/** How many sub-agents a delegate call opened, from what the model sent. */
function agentCount(segment: AparteToolCallSegment): number {
    const agents = (segment.toolCall.input as { agents?: unknown }).agents;
    return Array.isArray(agents) ? agents.length : 0;
}

/**
 * The delegate row's label when it opened SEVERAL sub-agents: each of them has a line of its
 * own under it, so the call says what the model did ("Delegated to 3 sub-agents") rather than
 * staying an identifier above them. One sub-agent IS the call's line, named by the plugin
 * after the sub-agent: `''` leaves it that name.
 */
export function delegateLabel(segment: AparteToolCallSegment): string {
    const n = agentCount(segment);
    if (n < 2) return '';
    if (segment.status === 'pending') return `Delegating to ${n} sub-agents…`;
    if (segment.status === 'resolved') return `Delegated to ${n} sub-agents`;
    return `Delegate to ${n} sub-agents`;
}
