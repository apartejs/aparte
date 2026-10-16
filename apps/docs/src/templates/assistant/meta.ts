/** The Assistant template, as the grid, the page's bar, the social card and the sitemap read it. */
import type { TemplateMeta } from '../types';

export default {
    slug: 'assistant',
    title: 'Assistant',
    description:
        'A general chat assistant: conversations by date in a sidebar, answers in Markdown with code, reasoning and a web search, versions of a reply, files and a model picker.',
    order: 1,
    uses: [
        'app-shell',
        'sidebar',
        'conversation-list',
        'header',
        'chat',
        'suggestions',
        'response',
        'reasoning',
        'code-block',
        'tool',
        'message-actions',
        'branches',
        'attachments',
        'model-selector',
    ],
} satisfies TemplateMeta;
