import type { TemplateMeta } from '../types';

export default {
    slug: 'travel-concierge',
    title: 'Travel concierge',
    description:
        'A travel app’s concierge: the forecast for the trip, places to eat with their hours, a stay booked after an approval, all drawn as rich cards, beside the trip it plans.',
    order: 6,
    uses: ['weather-card', 'place-card', 'order-card', 'media-card', 'approval', 'chat', 'tool', 'suggestions', 'avatar', 'card', 'badge', 'alert'],
} satisfies TemplateMeta;
