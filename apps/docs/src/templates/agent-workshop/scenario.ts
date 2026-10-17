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
import type { Scenario, ScenarioStep, ScenarioTurn } from '@aparte/provider-scenario';
import { initialFiles } from './repo';
import type { ToolName } from './tools';
import { unifiedDiff } from './workspace';

/** What the landing's showcase types, and the first suggestion. */
export const PLAY_QUESTION = "Issue #42: parse('1.5h') returns one hour instead of ninety minutes. Find the cause and fix it.";

/** The starters under the empty chat: each one is a scripted path below. */
export const SUGGESTIONS = [
    { label: 'Fix issue #42', prompt: PLAY_QUESTION },
    { label: 'Explain the parser', prompt: "How does parse() read '1h 30m'? Walk me through it." },
    { label: 'Run the tests', prompt: 'Run the whole test suite.' },
];

const FIX = /#42|1\.5h|decimal|\bfix\b/i;
const EXPLAIN = /how does|explain|walk me/i;

const FIX_EDIT = { path: 'src/parse.ts', find: 'parseInt(amount, 10)', replace: 'Number(amount)' };
const PARSER_TESTS = 'pnpm test tests/parse.test.ts';

/** The patch the agent produces once the tests pass: the diff of its own edit. */
const PATCH = (() => {
    const before = initialFiles().get(FIX_EDIT.path)!;
    return unifiedDiff(FIX_EDIT.path, before, before.replace(FIX_EDIT.find, FIX_EDIT.replace)).text;
})();

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

    // ── Fix issue #42 ────────────────────────────────────────────────────────
    fix: {
        when: FIX,
        turn: [
            { thinking: 'A decimal amount loses its fraction, so the amount is probably read with an integer parse. Find where parse() turns it into a number.' },
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
            { text: 'Reproduced: *reads decimal amounts* fails with `expected 3600000 to be 5400000`, one hour instead of ninety minutes. `Number` keeps the fraction:' },
            { tool: 'write_file', input: FIX_EDIT },
        ],
    },
    rerun: { after: 'write_file', turn: [{ tool: 'run_command', input: { command: PARSER_TESTS } }] },
    verified: {
        turn: [
            { text: 'All 6 tests pass. Here is the patch:' },
            { tool: 'create_artifact', input: { mimeType: 'application/vnd.ant.diff', title: 'fix-42.patch', content: PATCH } },
        ],
    },
    wrapped: {
        after: 'create_artifact',
        turn: reply(
            'Done: one line changed in `src/parse.ts`, and the parser’s tests are green.\n\n**Pull request summary.** *Fix #42: keep the fraction of a decimal amount.* `parse("1.5h")` returned one hour because the amount went through `parseInt`, which stops at the decimal point; it now goes through `Number`. Tests: `pnpm test tests/parse.test.ts`, 6 passed. Closes #42.',
            12600,
        ),
    },

    // ── After a plan, or a refusal ───────────────────────────────────────────
    apply: { when: /apply it|go ahead/i, turn: [{ text: 'Applying it.' }, { tool: 'write_file', input: FIX_EDIT }] },
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
export function route(request: AparteChatRequest): string | undefined {
    const { messages } = request;
    const last = messages[messages.length - 1];
    if (last?.role !== 'tool') return undefined;
    const result = contentToText(last.content);

    // The current request: everything since the person's last message.
    let start = messages.length - 1;
    while (start > 0 && messages[start]!.role !== 'user') start--;
    const asked = contentToText(messages[start]!.content);
    const turn = messages.slice(start);

    // The approval plugin's refusal in Plan mode, and the loop's when the person rejects a call.
    if (result.includes('Plan mode:')) return FIX.test(asked) ? 'planned' : 'refused';
    if (/rejected (by the user|this tool call)/.test(result)) return 'declined';

    const name = last.toolName as ToolName | undefined;
    if (name === 'read_file' && EXPLAIN.test(asked)) return 'explained';
    if (name === 'run_command') {
        const failing = /\d+ failed/.test(result);
        if (turn.some((m) => m.toolCalls?.some((call) => call.name === 'write_file'))) return 'verified';
        if (!failing) return /Tests\s+6 passed/.test(result) ? 'greenParser' : 'green';
        if (!FIX.test(asked)) return 'failingSuite';
    }
    return undefined;
}

/** One step of the conversation the tile shows: what the agent said, or a tool it called. */
export type SeedStep =
    | { text: string }
    | { thinking: string }
    | { tool: ToolName; input: Record<string, unknown>; rejected?: string };

/**
 * The tile's frozen moment, mid-task: the agent found the bug, was told to run only the parser's
 * tests, reproduced the failure and wrote the fix (approved). The tools run for real against the
 * workspace (app.ts), so the panel shows what they did.
 */
export const SEED_STEPS: SeedStep[] = [
    { tool: 'search', input: { query: 'parseInt', path: 'src' } },
    { tool: 'read_file', input: { path: 'src/parse.ts' } },
    { text: '`parseInt` stops at the decimal point: `1.5` becomes `1`.' },
    { tool: 'run_command', input: { command: 'pnpm test' }, rejected: 'Just the parser’s tests for now.' },
    { tool: 'run_command', input: { command: PARSER_TESTS } },
    { text: 'Reproduced. `Number` keeps the fraction:' },
    { tool: 'write_file', input: FIX_EDIT },
];
