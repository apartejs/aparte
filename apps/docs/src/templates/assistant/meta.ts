/** The Assistant template, as the grid, the page's bar, the social card and the sitemap read it. */
import type { TemplateMeta } from '../types';

export default {
    slug: 'assistant',
    title: 'Assistant',
    pageTitle: 'Open-source ChatGPT-style chat UI — an aparté template',
    description:
        'A ChatGPT-style assistant: conversations in a sidebar, Markdown and code, reasoning, web search, versions of a reply, files and a model picker.',
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
