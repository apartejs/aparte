import type { TemplateMeta } from '../types';

export default {
    slug: 'agent-workshop',
    title: 'Agent workshop',
    description: 'A coding agent beside its workspace: it keeps a task list as it reads, edits and tests a repository, asks before it writes, and shows the file, the terminal and the diff.',
    order: 2,
    uses: ['split', 'tabs', 'tool', 'approval', 'approval-mode', 'status-line', 'context-gauge', 'scroll-rail', 'artifact', 'reasoning', 'code-block', 'suggestions', 'header', 'card'],
} satisfies TemplateMeta;
