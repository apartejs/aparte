import type { TemplateMeta } from '../types';

export default {
    slug: 'n8n-chat',
    title: 'n8n chat widget',
    pageTitle: 'n8n chat widget — a drop-in replacement for @n8n/chat',
    description: 'n8n’s chat widget, rebuilt: the same createChat call on a Chat Trigger, in n8n’s look or your brand’s, in English or French — here on a replay of a real workflow, or on your own n8n.',
    order: 4,
    uses: ['launcher', 'chat', 'suggestions', 'attachments'],
} satisfies TemplateMeta;
