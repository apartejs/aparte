/**
 * The help center the assistant searches: a handful of Kilnhouse articles, the
 * `search_help_center` tool the model calls, and @aparte/plugin-cards' items card, which draws
 * its result as article rows instead of the default tool row.
 *
 * In a real widget the handler would query your help center's search API; everything
 * else here (the tool's shape, the structured result, the card) stays as it is.
 */
import { aparteGlobalConfig } from '@aparte/core';
import { setupItemsCard } from '@aparte/plugin-cards/items';

export interface HelpArticle {
    id: string;
    title: string;
    summary: string;
    section: string;
    minutes: number;
    url: string;
    /** Words a question uses when this article is the answer. */
    keywords: string[];
}

/** What the tool hands the card, beside the text the model reads. */
export interface HelpSearchResult {
    query: string;
    articles: HelpArticle[];
}

export const SEARCH_TOOL = 'search_help_center';

const ARTICLES: HelpArticle[] = [
    {
        id: 'waitlists',
        title: 'Add a waitlist to a full class',
        summary: 'Turn a waitlist on for any class. When a spot opens, the first student in line gets a text and two hours to claim it.',
        section: 'Classes',
        minutes: 3,
        url: 'https://example.com/help/classes/waitlists',
        keywords: ['waitlist', 'full', 'spot', 'queue', 'capacity'],
    },
    {
        id: 'waitlist-offers',
        title: 'How waitlist spots are offered',
        summary: 'The order students are offered a spot, how long they have to accept, and what happens when nobody does.',
        section: 'Classes',
        minutes: 2,
        url: 'https://example.com/help/classes/waitlist-offers',
        keywords: ['waitlist', 'spot', 'offer', 'claim'],
    },
    {
        id: 'capacity',
        title: 'Set class capacity and hold seats',
        summary: 'Cap a class by seats or by wheels, and keep a seat or two back for members.',
        section: 'Classes',
        minutes: 4,
        url: 'https://example.com/help/classes/capacity',
        keywords: ['capacity', 'seats', 'wheels', 'class'],
    },
    {
        id: 'refunds',
        title: 'Refund a class pass',
        summary: 'Refund the unused credits on a pass, in full or in part. The money reaches the card in 5 to 10 working days.',
        section: 'Payments',
        minutes: 3,
        url: 'https://example.com/help/payments/refund-a-pass',
        keywords: ['refund', 'pass', 'credits', 'money', 'cancel'],
    },
    {
        id: 'memberships',
        title: 'Pause or cancel a membership',
        summary: 'Pause a membership for up to three months, or cancel it at the end of the current period.',
        section: 'Payments',
        minutes: 2,
        url: 'https://example.com/help/payments/memberships',
        keywords: ['membership', 'pause', 'cancel', 'pass'],
    },
    {
        id: 'change-plan',
        title: 'Change your Kilnhouse plan',
        summary: 'Upgrade or downgrade from Settings, Plan. The difference is prorated to the day.',
        section: 'Account and billing',
        minutes: 2,
        url: 'https://example.com/help/billing/change-plan',
        keywords: ['plan', 'upgrade', 'downgrade', 'billing', 'price', 'invoice'],
    },
    {
        id: 'compare-plans',
        title: 'Compare the Starter, Studio and Collective plans',
        summary: 'What each plan includes: teachers, rooms, waitlists, memberships and payouts.',
        section: 'Account and billing',
        minutes: 3,
        url: 'https://example.com/help/billing/compare-plans',
        keywords: ['plan', 'starter', 'studio', 'collective', 'waitlist', 'price'],
    },
];

/** The articles whose keywords the query mentions, best first: two, which is what a 380-pixel panel shows. */
export function searchHelpCenter(query: string, limit = 2): HelpArticle[] {
    const words = query.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    const score = (article: HelpArticle): number =>
        article.keywords.filter((keyword) => words.some((word) => word.startsWith(keyword))).length;
    return ARTICLES.map((article) => ({ article, score: score(article) }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((hit) => hit.article);
}

/** The structured result for a query: also what a seeded conversation stores. */
export function helpSearch(query: string): HelpSearchResult {
    return { query, articles: searchHelpCenter(query) };
}

/** What the model reads of a result: each article's title and summary. */
export function describeSearch(result: HelpSearchResult): string {
    return result.articles.length
        ? result.articles.map((a) => `${a.title}: ${a.summary}`).join('\n')
        : 'No article matches.';
}

/** Register the tool and its card on the global config. */
export function setupHelpCenter(): void {
    aparteGlobalConfig.registerTool(
        {
            name: SEARCH_TOOL,
            description: 'Search the Kilnhouse help center. Returns the most relevant articles.',
            inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        },
        async (call) => {
            const result = helpSearch(String(call.input['query'] ?? ''));
            return { toolCallId: call.id, content: describeSearch(result), structuredContent: result };
        },
    );
    // The articles as @aparte/plugin-cards' items card, one row each: the title, the summary,
    // the section and the reading time; the whole row opens the article.
    setupItemsCard({
        tool: SEARCH_TOOL,
        map: (result: HelpSearchResult) => ({
            title: 'From the Help Center',
            items: result.articles.map((article) => ({
                title: article.title,
                description: article.summary,
                meta: [article.section, `${article.minutes} min read`],
                url: article.url,
            })),
        }),
        variant: 'list',
    });
}
