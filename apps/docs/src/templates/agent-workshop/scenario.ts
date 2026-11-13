/**
 * What the Agent workshop's scripted model does. Everything else on the page is the real library
 * and the real loop: the client offers the tools, asks for approval, runs the handlers and hands
 * the results back. Only the model is a script, so the agent works without a key and the same way
 * every time.
 *
 * A turn after a tool result follows that tool (`after`). `route` handles the turns that depend on
 * what the result SAID, which `after` cannot see: a refusal, a failing test run, a read made to
 * explain rather than to fix.
 */
import { contentToText, type AparteChatRequest } from '@aparte/core';
import type { PlanStatus } from '@aparte/plugin-cards/plan';
import type { Scenario, ScenarioStep, ScenarioSubagent, ScenarioTurn } from '@aparte/provider-scenario';
import { initialFiles } from './repo';
import { PLAN_TOOL, type PlanStep, type ToolName } from './tools';
import { unifiedDiff } from './workspace';

/** What the landing's showcase types, and the first suggestion. */
export const PLAY_QUESTION = "Issue #42: parse('1.5h') returns one hour instead of ninety minutes. Find the cause and fix it.";

/** The starters under the empty chat: each one is a scripted path below. */
export const SUGGESTIONS = [
    { label: 'Fix issue #42', prompt: PLAY_QUESTION },
    { label: 'Explain the parser', prompt: "How does parse() read '1h 30m'? Walk me through it." },
    { label: 'Run the tests', prompt: 'Run the whole test suite.' },
    { label: 'Investigate with sub-agents', prompt: 'Split issue #42 between sub-agents: one reads the parser, one finds its callers, one runs the tests. Then fix it.' },
];

const FIX = /#42|1\.5h|decimal|\bfix\b/i;
const EXPLAIN = /how does|explain|walk me/i;
const APPLY = /apply it|go ahead/i;
const DELEGATE = /sub-?agents?\b/i;

const FIX_EDIT = { path: 'src/parse.ts', find: 'parseInt(amount, 10)', replace: 'Number(amount)' };
const PARSER_TESTS = 'pnpm test tests/parse.test.ts';

/** The patch the agent produces once the tests pass: the diff of its own edit. */
const PATCH = (() => {
    const before = initialFiles().get(FIX_EDIT.path)!;
    return unifiedDiff(FIX_EDIT.path, before, before.replace(FIX_EDIT.find, FIX_EDIT.replace)).text;
})();

/** The fix's task list: each step as an instruction, and as the work while it runs. */
const FIX_STEPS = [
    ['Find where parse() reads the amount', 'Finding where parse() reads the amount'],
    ['Reproduce the bug with the parser’s tests', 'Reproducing the bug with the parser’s tests'],
    ['Keep the fraction of a decimal amount', 'Keeping the fraction of a decimal amount'],
    ['Run the parser’s tests again', 'Running the parser’s tests again'],
] as const;

/** An update_plan call: the fix's steps, each where it stands now (pending when not given). */
function plan(...statuses: PlanStatus[]): { tool: typeof PLAN_TOOL.name; input: Record<string, unknown> } {
    const steps: PlanStep[] = FIX_STEPS.map(([title, activeForm], i) => ({ title, activeForm, status: statuses[i] ?? 'pending' }));
    return { tool: PLAN_TOOL.name, input: { title: 'Fix #42', steps } };
}

/** The fix itself, once the cause is known: the plan moves to its third step, and the edit. */
const WRITE_FIX: ScenarioStep[] = [plan('done', 'done', 'in-progress'), { tool: 'write_file', input: FIX_EDIT }];

/**
 * The sub-agents the investigation is split between, each with its task and its own model's
 * turns. They call the page's real tools, so their reads open in Files and their test run lands
 * in Terminal, and their rows are drawn like the agent's own under each line (app.ts).
 */
/** What the Test runner says when its `pnpm test` did not run; `route` reads it in its report. */
const TESTS_NOT_RUN = 'I could not run the tests: `pnpm test` was refused';

/** The file the agent reads itself while its sub-agents investigate. */
const FAILING_TEST = 'tests/parse.test.ts';

/** How the loop says that the sub-agents started in the background are back. */
const BACK = /sub-agents? you started (is|are) back/i;

/**
 * Whether a tool result is a refusal, and whose: the approval plugin's in Plan mode, or the
 * loop's when the person rejects a call.
 */
function refusalOf(result: string): 'plan' | 'person' | undefined {
    if (result.includes('Plan mode:')) return 'plan';
    if (/rejected (by the user|this tool call)/.test(result)) return 'person';
    return undefined;
}

export const INVESTIGATORS: ScenarioSubagent[] = [
    {
        name: 'Parser reader',
        task: 'Read src/parse.ts and find where the amount becomes a number',
        turns: [
            // A step its line says while no call of it runs: before the read, and after it.
            [{ step: 'Reading the parser' }, { thinking: 'The amount is captured by the pattern, then turned into a number in the replace callback.' }, { tool: 'read_file', input: { path: 'src/parse.ts' } }],
            [
                { wait: 500 },
                { endStep: 'Reading the parser' },
                { text: 'Line 15 reads the amount with `parseInt(amount, 10)`, which stops at the decimal point: `1.5` becomes `1`. The pattern on line 7 already accepts decimals, so that call is the only place the fraction is lost.' },
            ],
        ],
    },
    {
        name: 'Caller search',
        task: 'Find every caller of parse() in the repository',
        turns: [
            [{ step: 'Searching the repository' }, { wait: 400 }, { tool: 'search', input: { query: 'parse(' } }],
            [
                { endStep: 'Searching the repository' },
                { text: "No code in `src/` calls `parse()` besides its own definition. Its callers are the tests, six in `tests/parse.test.ts` and the round-trip in `tests/format.test.ts`, and the README, which already promises decimal amounts: `parse('1.5h')`." },
            ],
        ],
    },
    {
        name: 'Test runner',
        task: 'Run the test suite and report what fails',
        turns: [
            [{ wait: 900 }, { tool: 'run_command', input: { command: 'pnpm test' } }],
            // It reports what its run said: a refused `pnpm test` ran nothing, so nothing failed.
            (request) => {
                const last = request.messages[request.messages.length - 1];
                const why = last?.role === 'tool' ? refusalOf(contentToText(last.content)) : undefined;
                if (why === 'plan') return `${TESTS_NOT_RUN} in Plan mode.`;
                if (why === 'person') return `${TESTS_NOT_RUN}.`;
                return '1 of 11 tests fails: *reads decimal amounts* in `tests/parse.test.ts`, `expected 3600000 to be 5400000`. The other 10 pass.';
            },
        ],
    },
];

/**
 * The tests pass after the fix: the plan's last update, then the patch. Reached from the fix run,
 * or from "apply it" after a Plan-mode answer, which never reproduced the bug.
 */
function verified(reproduced: boolean): ScenarioTurn {
    return [
        { text: 'All 6 tests pass.' },
        plan('done', reproduced ? 'done' : 'skipped', 'done', 'done'),
        { tool: 'create_artifact', input: { mimeType: 'application/vnd.ant.diff', title: 'fix-42.patch', content: PATCH } },
    ];
}

/**
 * A reply that also reports how big its request was. A coding agent sends its tool definitions
 * and the files it read with every call; the scripted provider estimates the messages alone, so
 * the end of each path says what a real request weighs, and the context gauge reads that.
 */
const reply = (text: string, inputTokens: number): ScenarioTurn => [{ text }, usage(inputTokens, Math.ceil(text.length / 4))];

function usage(inputTokens: number, outputTokens: number): ScenarioStep {
    return { usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } };
}

export const SCENARIOS: Record<string, Scenario | ScenarioTurn> = {
    default:
        'That is outside what this demo agent is scripted for. I work in **spanwise**, the repository beside this chat: I can search and read it, edit its files and run its tests, and I ask before I write or run anything. Try one of the suggestions.',

    // ── Investigate #42 with sub-agents, then fix it ─────────────────────────
    // Before `fix`, whose pattern the prompt also matches. The three run side by side, in the
    // background: the agent reads the failing test itself while they work, and once they are back
    // it writes the fix, and the fix path below takes over from its edit (`rerun`, `verified`,
    // `wrapped`).
    investigate: {
        when: DELEGATE,
        turn: [
            { thinking: 'Three independent questions: how the amount is read, who calls parse(), and what the tests say. They can run at once, and I can read the failing test while they do.' },
            { text: 'Three questions, three sub-agents: what `parse` does with the amount, who calls it, and what the tests say.' },
            { subagents: INVESTIGATORS, background: true },
        ],
    },
    investigating: {
        turn: [
            { text: 'While they look, I read the test that fails.' },
            { tool: 'read_file', input: { path: FAILING_TEST } },
        ],
    },
    waiting: {
        turn: '*reads decimal amounts* expects `parse("1.5h")` to be ninety minutes. Waiting for the three of them before I touch anything.',
    },
    investigated: {
        after: 'delegate',
        turn: [
            { text: 'All three point at one line: `parseInt` on line 15 drops the fraction, and *reads decimal amounts* is the one failing test. No code in `src/` calls `parse()`, so reading the amount with `Number` changes nothing else.' },
            ...WRITE_FIX,
        ],
    },

    // ── Fix issue #42 ────────────────────────────────────────────────────────
    // The plan first, the way a coding agent writes its task list before it starts; it updates
    // the list as the steps finish (`diagnosed`, `verified`).
    fix: {
        when: FIX,
        turn: [
            { thinking: 'A decimal amount loses its fraction, so the amount is probably read with an integer parse. Find where parse() turns it into a number, reproduce, fix, test again.' },
            plan('in-progress'),
        ],
    },
    locate: {
        after: PLAN_TOOL.name,
        turn: [
            { text: 'Let me find where `parse` turns the amount into a number.' },
            { tool: 'search', input: { query: 'parseInt', path: 'src' } },
        ],
    },
    found: { after: 'search', turn: [{ tool: 'read_file', input: { path: 'src/parse.ts' } }] },
    reproduce: {
        after: 'read_file',
        turn: [
            { text: 'Line 15 reads the amount with `parseInt`, which stops at the decimal point: `1.5` becomes `1`. The pattern on line 7 already accepts decimals. Let me reproduce it first.' },
            { tool: 'run_command', input: { command: PARSER_TESTS } },
        ],
    },
    diagnosed: {
        after: 'run_command',
        turn: [
            { text: 'Reproduced: *reads decimal amounts* fails with `expected 3600000 to be 5400000`, one hour instead of ninety minutes. `Number` keeps the fraction.' },
            ...WRITE_FIX,
        ],
    },
    rerun: { after: 'write_file', turn: [{ tool: 'run_command', input: { command: PARSER_TESTS } }] },
    verified: { turn: verified(true) },
    verifiedApplied: { turn: verified(false) },
    wrapped: {
        after: 'create_artifact',
        turn: reply(
            'Done: one line changed in `src/parse.ts`, and the parser’s tests are green.\n\n**Pull request summary.** *Fix #42: keep the fraction of a decimal amount.* `parse("1.5h")` returned one hour because the amount went through `parseInt`, which stops at the decimal point; it now goes through `Number`. Tests: `pnpm test tests/parse.test.ts`, 6 passed. Closes #42.',
            12600,
        ),
    },

    // ── After a plan, or a refusal ───────────────────────────────────────────
    apply: { when: APPLY, turn: [{ text: 'Applying it.' }, { tool: 'write_file', input: FIX_EDIT }] },
    planned: {
        turn: reply('In **Plan** mode I can read but not run or change anything, so nothing has moved. The plan:\n\n1. In `src/parse.ts`, line 15, read the amount with `Number(amount)` instead of `parseInt(amount, 10)`, which drops the fraction.\n2. Run `pnpm test tests/parse.test.ts`: *reads decimal amounts* should pass with the other five.\n\nSwitch the mode to **Ask** and tell me to *apply it*.', 9400),
    },
    refused: {
        turn: reply('In **Plan** mode I can read but not run or change anything, so I stopped there. Switch the mode to **Ask** and ask me again.', 7600),
    },
    declined: {
        turn: reply('Understood, I have left it there. Tell me what you would rather I do, or ask me to try again.', 8200),
    },

    // ── Explain the parser ───────────────────────────────────────────────────
    explain: { when: EXPLAIN, turn: [{ tool: 'read_file', input: { path: 'src/parse.ts' } }] },
    explained: {
        turn: [
            { thinking: 'Walk through the one pattern and the replace callback, with 1h 30m as the example.' },
            {
                text: '`parse` trims and lowercases the input, then walks it with one pattern, `TOKEN`: an amount, optional space, a unit.\n\n```ts\nconst TOKEN = /(\\d+(?:\\.\\d+)?)\\s*(ms|s|m|h|d)/g;\n```\n\nFor `1h 30m` it finds `1h` and `30m`. Each match adds its amount times `UNITS[unit]` to the total (an hour is 3\u00a0600\u00a0000\u00a0ms, a minute 60\u00a0000) and is replaced by nothing, so the total is **5\u00a0400\u00a0000\u00a0ms**. Whatever is left over means the input had something the pattern could not read, and `parse` throws a `RangeError`: `1h banana` fails loudly instead of returning an hour.',
            },
            usage(7800, 160),
        ],
    },

    // ── Run the suite ────────────────────────────────────────────────────────
    tests: { when: /test suite|run (the )?tests/i, turn: [{ text: 'Running the whole suite.' }, { tool: 'run_command', input: { command: 'pnpm test' } }] },
    failingSuite: {
        turn: reply('One test of 11 fails: *reads decimal amounts* in `tests/parse.test.ts`, because `parse(\'1.5h\')` returns one hour. That is issue #42; ask me to fix it.', 8900),
    },
    greenParser: reply('The parser’s 6 tests pass.', 8700),
    green: reply('All 11 tests pass, in `tests/format.test.ts` and `tests/parse.test.ts`.', 8700),
};

/**
 * The turns that depend on what a tool result said. Anything else returns `undefined`, and the
 * provider's default rule answers: the `after` of the tool, or the first `when` that matches.
 */
/** The call a `tool` message answers. */
function callOf(messages: AparteChatRequest['messages'], id: string | undefined) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const call = messages[i]!.toolCalls?.find((c) => c.id === id);
        if (call) return call;
    }
    return undefined;
}

export function route(request: AparteChatRequest): string | undefined {
    const { messages } = request;
    const last = messages[messages.length - 1];
    // The message the loop writes once the sub-agents started in the background are back: the
    // investigation's end, unless the Test runner reports that its run was refused.
    if (last?.role === 'user') {
        const report = contentToText(last.content);
        if (!BACK.test(report)) return undefined;
        let asked = '';
        for (let i = messages.length - 2; i >= 0; i--) {
            if (messages[i]!.role === 'user' && !BACK.test(contentToText(messages[i]!.content))) { asked = contentToText(messages[i]!.content); break; }
        }
        if (report.includes(`${TESTS_NOT_RUN} in Plan mode`)) return FIX.test(asked) ? 'planned' : 'refused';
        if (report.includes(TESTS_NOT_RUN)) return 'declined';
        return 'investigated';
    }
    if (last?.role !== 'tool') return undefined;
    const result = contentToText(last.content);

    // The current request: everything since the person's last message (the loop's report on
    // the sub-agents is a user message too, and not the person's).
    let start = messages.length - 1;
    while (start > 0 && (messages[start]!.role !== 'user' || BACK.test(contentToText(messages[start]!.content)))) start--;
    const asked = contentToText(messages[start]!.content);
    const turn = messages.slice(start);

    // The approval plugin's refusal in Plan mode, and the loop's when the person rejects a call.
    const why = refusalOf(result);
    if (why === 'plan') return FIX.test(asked) ? 'planned' : 'refused';
    if (why === 'person') return 'declined';

    const name = last.toolName as ToolName | undefined;
    // The investigation is started, not over: the agent goes on while the three work.
    if ((name as string | undefined) === 'delegate' && result.startsWith('Started ')) return 'investigating';
    if (name === 'read_file' && callOf(messages, last.toolCallId)?.input['path'] === FAILING_TEST) return 'waiting';
    // The Test runner's refusal, as it reported it: the same answer as a refused run of the agent's own.
    if ((name as string | undefined) === 'delegate' && result.includes(TESTS_NOT_RUN)) {
        if (!result.includes(`${TESTS_NOT_RUN} in Plan mode`)) return 'declined';
        return FIX.test(asked) ? 'planned' : 'refused';
    }
    if (name === 'read_file' && EXPLAIN.test(asked)) return 'explained';
    if (name === 'run_command') {
        const failing = /\d+ failed/.test(result);
        if (turn.some((m) => m.toolCalls?.some((call) => call.name === 'write_file'))) return APPLY.test(asked) ? 'verifiedApplied' : 'verified';
        if (!failing) return /Tests\s+6 passed/.test(result) ? 'greenParser' : 'green';
        if (!FIX.test(asked)) return 'failingSuite';
    }
    return undefined;
}

/** One step of the conversation the tile shows: what the agent said, or a tool it called. */
export type SeedStep =
    | { text: string }
    | { thinking: string }
    | { tool: ToolName | typeof PLAN_TOOL.name; input: Record<string, unknown>; rejected?: string };

/**
 * The tile's frozen moment, mid-task: the agent wrote its plan, found the bug, was told to run
 * only the parser's tests, reproduced the failure, moved its plan on and wrote the fix (approved).
 * The tools run for real against the workspace (app.ts), so the panel shows what they did.
 */
export const SEED_STEPS: SeedStep[] = [
    plan('in-progress'),
    { tool: 'search', input: { query: 'parseInt', path: 'src' } },
    { tool: 'read_file', input: { path: 'src/parse.ts' } },
    { text: '`parseInt` stops at the decimal point: `1.5` becomes `1`.' },
    { tool: 'run_command', input: { command: 'pnpm test' }, rejected: 'Just the parser’s tests for now.' },
    { tool: 'run_command', input: { command: PARSER_TESTS } },
    { text: 'Reproduced. `Number` keeps the fraction.' },
    plan('done', 'done', 'in-progress'),
    { tool: 'write_file', input: FIX_EDIT },
];
