import type { TemplateMeta } from '../types';

export default {
    slug: 'research-assistant',
    title: 'Research assistant',
    description: 'An agent that plans, searches, reads and writes: source cards in the chat, a cited report with a chart and a table in the pane beside it.',
    order: 4,
    uses: ['app-shell', 'sidebar', 'conversation-list', 'header', 'split', 'reasoning', 'tool', 'artifact', 'response', 'compaction-notice', 'context-gauge', 'suggestions', 'card'],
} satisfies TemplateMeta;
