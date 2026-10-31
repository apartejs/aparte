/** The Shopping assistant template, as the grid, the page's bar, the social card and the sitemap read it. */
import type { TemplateMeta } from '../types';

export default {
    slug: 'shopping-assistant',
    title: 'Shopping assistant',
    pageTitle: 'AI shopping assistant chat UI with product cards — an aparté template',
    description:
        'An online shop with its assistant docked beside the storefront: products as cards with prices and stock, an order’s receipt with tracking, and a return the customer approves.',
    order: 5,
    uses: ['product-card', 'order-card', 'launcher', 'chat', 'message', 'tool', 'question', 'approval', 'suggestions', 'avatar', 'card', 'badge', 'button', 'field', 'popover', 'alert'],
} satisfies TemplateMeta;
