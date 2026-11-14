/**
 * The page: aparté, reading the agent's AG-UI stream. It knows nothing about the Agents SDK,
 * OpenAI or the model — swap the server behind `/agent` and this file stays as it is.
 *
 * `?subagents` reads a scripted run with two sub-agents instead (`/subagents`), and
 * `@aparte/plugin-subagents` gives each one its line, its conversation kept out of the reply.
 *
 * `?tanstack` reads a TanStack AI agent whose router delegates to two sub-agents (`/tanstack`):
 * the same lines, each with an Open button that shows that sub-agent's conversation in a pane
 * beside the chat, and the router's plan drawn by the plan card, ticked as they finish.
 */
import '@aparte/core/styles.css';
import { AparteClient } from '@aparte/core';
import { setupPlanCard } from '@aparte/plugin-cards/plan';
import { connectSubagentView, setupSubagents } from '@aparte/plugin-subagents';
import type { AparteSubagentView, SubagentViewSplit } from '@aparte/plugin-subagents';
import { createAgUiRunner } from '@aparte/runner-ag-ui';

const params = new URLSearchParams(location.search);
const tanstack = params.has('tanstack');
const endpoint = tanstack ? '/tanstack' : params.has('subagents') ? '/subagents' : '/agent';

if (tanstack) {
    // A line per sub-agent, with an Open button; the router's plan, a `plan` activity, as a card.
    setupSubagents({ open: 'event' });
    setupPlanCard({ activity: 'plan' });
    // The chat and, beside it, the view a line opens: the split shows the chat alone until then.
    const chat = document.querySelector('aparte-chat')!;
    chat.id = 'chat';
    const split = document.createElement('aparte-split') as SubagentViewSplit;
    split.setAttribute('position', '60');
    split.setAttribute('single', '');
    const view = document.createElement('aparte-subagent-view') as AparteSubagentView;
    // Its panes in place before it is: the split arranges the children it connects with.
    const before = chat.nextSibling;
    const parent = chat.parentNode!;
    split.append(chat, view);
    parent.insertBefore(split, before);
    connectSubagentView({ chat, view, split });
    document.querySelector('.demo-note')!.textContent = 'A TanStack AI agent whose router delegates to two sub-agents, served over AG-UI from /tanstack, drawn by aparté.';
} else {
    setupSubagents();
}
new AparteClient({ streamRunner: createAgUiRunner({ endpoint, ...(tanstack ? { relaxedRunFraming: true } : {}) }) }).start();
