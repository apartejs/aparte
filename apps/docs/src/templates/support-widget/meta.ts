import type { TemplateMeta } from '../types';

export default {
    slug: 'support-widget',
    title: 'Support widget',
    description: 'A help chat on a product’s website: a launcher, a compact panel, help-center articles as cards, a question with choices, and a handoff to a person.',
    order: 3,
    uses: ['chat', 'message', 'tool', 'question', 'status-line', 'suggestions', 'attachments', 'avatar', 'card'],
} satisfies TemplateMeta;
