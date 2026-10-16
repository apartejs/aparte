/**
 * The help center the assistant searches: a handful of Kilnhouse articles, the
 * `search_help_center` tool the model calls, and the renderer that draws its result as
 * article cards instead of the default tool row.
 *
 * In a real widget the handler would query your help center's search API; everything
 * else here (the tool's shape, the structured result, the renderer) stays as it is.
 */
import { aparteGlobalConfig } from '@aparte/core';
import type { AparteToolCallSegment } from '@aparte/core';

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

/** What the tool hands the renderer, beside the text the model reads. */
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

/** Register the tool and its renderer on the global config. */
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
    // An element, not an HTML string: the query is the model's words, so nothing here goes
    // through innerHTML. `update` redraws the same root when the result lands.
    aparteGlobalConfig.registerToolRenderer(SEARCH_TOOL, {
        render(segment) {
            const root = document.createElement('div');
            root.className = 'sw-search';
            drawSearch(root, segment);
            return root;
        },
        update: drawSearch,
    });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function drawSearch(root: HTMLElement, segment: AparteToolCallSegment): void {
    const result = segment.structuredResult as HelpSearchResult | undefined;
    if (segment.status === 'pending') {
        const line = el('p', 'sw-search__lead');
        const spinner = el('span', 'aparte-spinner aparte-spinner--sm');
        spinner.setAttribute('aria-hidden', 'true');
        line.append(spinner, 'Searching the help center…');
        root.replaceChildren(line);
        return;
    }
    if (!result?.articles.length) {
        root.replaceChildren(el('p', 'sw-search__lead', segment.status === 'resolved' ? 'No help article matched.' : 'The help center could not be searched.'));
        return;
    }
    const list = el('ul', 'sw-articles');
    for (const [index, article] of result.articles.entries()) {
        const link = el('a', 'aparte-card sw-article');
        link.href = article.url;
        link.target = '_blank';
        link.rel = 'noopener';
        const body = el('span', 'aparte-card__body sw-article__body');
        const meta = el('span', 'sw-article__meta');
        meta.append(el('span', 'aparte-tag aparte-tag--sm', article.section), `${article.minutes} min read`);
        // The link is named by the title and says it opens a new tab; the summary describes it.
        const id = `${segment.id}-article-${index}`;
        const title = el('span', 'sw-article__title', article.title);
        const summary = el('span', 'sw-article__summary', article.summary);
        const newTab = el('span', 'aparte-sr-only', '(opens in a new tab)');
        title.id = `${id}-title`;
        summary.id = `${id}-summary`;
        newTab.id = `${id}-new-tab`;
        link.setAttribute('aria-labelledby', `${title.id} ${newTab.id}`);
        link.setAttribute('aria-describedby', summary.id);
        body.append(title, summary, meta, newTab);
        link.append(body);
        const item = el('li', 'sw-articles__item');
        item.append(link);
        list.append(item);
    }
    const count = result.articles.length;
    root.replaceChildren(el('p', 'sw-search__lead', `${count} article${count === 1 ? '' : 's'} from the Help Center`), list);
}
