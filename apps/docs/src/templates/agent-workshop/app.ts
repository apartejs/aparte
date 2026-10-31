/**
 * The Agent workshop's behaviour: Markdown and highlighting, the four tools, the plan and the
 * artifact tool, the approval modes, a scripted model behind the real client, the workspace panel, and the three
 * modes (src/templates/runtime.ts).
 */
import { aparteGlobalConfig, AparteClient, AparteDirectTransport, type AparteMessage, type AparteSegment } from '@aparte/core';
import { setupApproval } from '@aparte/plugin-approval';
import { setupArtifacts } from '@aparte/plugin-artifacts';
import { setupPlanCard } from '@aparte/plugin-cards/plan';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import { setupShikiProviderFromHighlighter } from '@aparte/plugin-shiki/core';
import { setupStreamingMarkdownProvider } from '@aparte/plugin-streaming-markdown';
import { createScenarioProvider } from '@aparte/provider-scenario';
import diff from '@shikijs/langs/diff';
import json from '@shikijs/langs/json';
import typescript from '@shikijs/langs/typescript';
import githubDark from '@shikijs/themes/github-dark-default';
import githubLight from '@shikijs/themes/github-light-high-contrast';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { followTheme, reducedMotion, replyPacing, templateMode, typeAndSend, whenShown } from '../runtime';
import { initialFiles } from './repo';
import { PLAY_QUESTION, route, SCENARIOS, SEED_STEPS, SUGGESTIONS } from './scenario';
import { createToolbox, PLAN_TOOL, planReceipt, statusOf, summaryOf, TOOLS, type ToolName } from './tools';
import { createWorkspace } from './workspace';

type Viewport = HTMLElement & { setMessages(messages: AparteMessage[]): void };
type Composer = HTMLElement & { setValue(value: string): void; submit(): void };

/** How long each tool takes, so the row and the status line are seen running. */
const LATENCY: Record<ToolName, number> = { read_file: 350, search: 450, write_file: 400, run_command: 900 };

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, reducedMotion() ? 0 : ms));

async function main(): Promise<void> {
    followTheme();

    // Markdown and highlighting before anything renders: a bubble drawn first would show its raw
    // text, then be drawn again. Shiki's /core entry with the three grammars this app shows, and a
    // light/dark pair that follows the site's theme.
    setupMarkedProvider();
    setupStreamingMarkdownProvider();
    setupShikiProviderFromHighlighter(
        await createHighlighterCore({ themes: [githubLight, githubDark], langs: [typescript, json, diff], engine: createJavaScriptRegexEngine() }),
        { theme: { light: 'github-light-high-contrast', dark: 'github-dark-default' } },
    );
    // The `create_artifact` tool and its card: the agent's pull-request summary.
    setupArtifacts();

    const root = document.querySelector<HTMLElement>('.agent-workshop')!;
    const workspace = createWorkspace(root.querySelector('.agent-workshop__workspace')!, initialFiles());
    const toolbox = createToolbox(workspace);
    const status = root.querySelector('aparte-chat-status')!;

    for (const tool of TOOLS) {
        aparteGlobalConfig.registerTool(tool, async (call) => {
            status.setAttribute('text', statusOf(tool.name, call.input));
            status.setAttribute('visible', '');
            try {
                await pause(LATENCY[tool.name]);
                return { toolCallId: call.id, content: toolbox[tool.name](call.input) };
            } finally {
                status.removeAttribute('visible');
            }
        });
        // An agent's workshop: the reader follows the work, so each row says Running and Done.
        aparteGlobalConfig.registerToolDisplay(tool.name, {
            summary: (segment) => summaryOf(tool.name, segment.toolCall.input),
            quiet: false,
        });
    }

    // The agent's task list: update_plan returns where the plan stands, and the plan card draws
    // the list from the call's input, a new card at each update.
    aparteGlobalConfig.registerTool(PLAN_TOOL, async (call) => ({ toolCallId: call.id, content: planReceipt(call.input) }));
    setupPlanCard({ tool: PLAN_TOOL.name, map: (_result, input) => input });

    // Which of these tools read, write or execute: the mode decides which of them ask first,
    // and Plan refuses the last two with a reason the model reads. The plan changes no file, so
    // it is read with the reads: it runs in every mode, without asking.
    const approval = setupApproval({
        classify: { read: ['read_file', 'search', PLAN_TOOL.name], write: ['write_file'], exec: ['run_command'] },
        mode: 'ask',
    });

    // The panel's title is "{tool}?" and the tool's name is wire format: "Allow run_command?" reads
    // better than the default "Run run_command?".
    aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), approvalAsk: 'Allow {tool}?' });

    const model = createScenarioProvider({
        id: 'workshop',
        name: 'Workshop agent',
        scenarios: SCENARIOS,
        match: route,
        pacing: replyPacing(),
        models: [{ id: 'workshop-coder', name: 'Coder', contextWindow: 32000, capabilities: ['streaming', 'function_calling'] }],
    });
    aparteGlobalConfig.registerAIProvider(model);
    aparteGlobalConfig.setModelConfig({ defaultProvider: model.id, defaultModel: 'workshop-coder' });
    aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
    new AparteClient().start();

    // The switch is created only now: it binds to the approval setup when it connects, and a tag
    // in the markup would connect first and find none.
    root.querySelector('aparte-composer-toolbar')!.prepend(document.createElement('aparte-approval-mode'));

    const suggestions = root.querySelector<HTMLElement & { suggestions: typeof SUGGESTIONS }>('aparte-suggestions')!;
    suggestions.suggestions = SUGGESTIONS;

    workspace.open('src/parse.ts', 'opened');

    const viewport = root.querySelector<Viewport>('aparte-chat-viewport')!;
    const composer = root.querySelector<Composer>('aparte-composer')!;
    const mode = templateMode();

    if (mode === 'thumb') {
        // The tile shows the task half done, at once: the same tools, run without the model.
        viewport.setMessages(seedConversation(toolbox));
        workspace.select('files');
        // The gauge reads the usage a turn reports; the tile has had no turn, so it is given one.
        root.querySelector<HTMLElement & { used: number | null }>('aparte-context')!.used = 7920;
    } else if (mode === 'play') {
        // Auto, so the showcase runs to the end without waiting on a click; the switch shows it.
        approval.setMode('auto');
        whenShown(() => void typeAndSend(composer, PLAY_QUESTION));
    }
}

/** The tile's conversation: the question, and the agent's reply up to the fix (scenario.ts). */
function seedConversation(toolbox: ReturnType<typeof createToolbox>): AparteMessage[] {
    const segments: AparteSegment[] = SEED_STEPS.map((step, i): AparteSegment => {
        const id = `s${i}`;
        if ('thinking' in step) return { id, type: 'thinking', isStreaming: false, label: 'Thinking', content: step.thinking };
        if ('text' in step) return { id, type: 'text', content: step.text };
        const toolCall = { id: `t${i}`, name: step.tool, input: step.input };
        if (step.rejected) return { id, type: 'tool_call', status: 'rejected', toolCall, result: `The user rejected this tool call and said: ${step.rejected}` };
        const result = step.tool === PLAN_TOOL.name ? planReceipt(step.input) : toolbox[step.tool](step.input);
        return { id, type: 'tool_call', status: 'resolved', toolCall, result };
    });
    const at = Date.parse('2026-10-16T10:12:00');
    return [
        { id: 'u1', role: 'user', content: PLAY_QUESTION, timestamp: at },
        { id: 'a1', role: 'assistant', segments, timestamp: at + 41000 },
    ];
}

void main();
