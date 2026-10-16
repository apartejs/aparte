import type { TemplateMeta } from '../types';

export default {
    slug: 'assistant',
    title: 'Assistant',
    description: 'A general chat assistant: conversations in a sidebar, answers in Markdown with code and reasoning, a model picker.',
    order: 1,
    uses: ['chat', 'conversation-list', 'sidebar', 'response', 'reasoning', 'code-block', 'model-selector', 'suggestions'],
} satisfies TemplateMeta;
