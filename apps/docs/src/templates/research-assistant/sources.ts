/**
 * The web this template searches: a handful of pages about Port Merrow, a city that does not
 * exist, and its bike-share. Every figure here is invented for the demo. The two tools in
 * tools.ts answer from this file, the way a real app's would answer from a search API and a
 * page fetcher.
 */

export interface Source {
    title: string;
    url: string;
    /** Who published it, for the report's reference list. */
    publisher: string;
    /** What a search result shows under the title. */
    snippet: string;
    /** The words a query has to share with it to find it. */
    keywords: string[];
    /** What read_page returns: the part of the page the model reads. */
    text: string;
}

export const OPERATOR_REPORT: Source = {
    title: 'Merrow Wheels: year-one performance report',
    url: 'https://transit.portmerrow.example.org/reports/merrow-wheels-year-one',
    publisher: 'Port Merrow Transit Authority',
    snippet: '412,000 trips between April 2025 and March 2026 across 60 stations. E-bikes, 40% of the fleet, carried 57% of them.',
    keywords: ['merrow', 'wheels', 'bike-share', 'ridership', 'year', 'first', 'report', 'trips'],
    text: 'Trips: 412,000 (trips under two minutes excluded). Stations: 60. Bikes: 600, of which 240 e-bikes. '
        + 'E-bike share of trips: 57%. Annual members: 9,400; members made 61% of trips. '
        + 'Reported collisions: 23, none serious; 5.6 per 100,000 trips. Farebox recovery: 64% of operating cost.',
};

export const TRIP_DATA: Source = {
    title: 'Bike-share trips, monthly (April 2025 – March 2026)',
    url: 'https://data.portmerrow.example.org/datasets/bike-share-trips',
    publisher: 'Port Merrow Open Data',
    snippet: 'Monthly trip counts by start station and district, with average duration and distance. Updated on the 5th of each month.',
    keywords: ['merrow', 'bike-share', 'trips', 'monthly', 'data', 'ridership', 'station'],
    text: 'Trips per month (thousands): Apr 24.1, May 33.8, Jun 42.4, Jul 47.1, Aug 46.8, Sep 49.6, Oct 41.3, '
        + 'Nov 29.9, Dec 21.3, Jan 17.9, Feb 22.6, Mar 35.2. Average trip: 14 minutes, 2.3 km. '
        + 'Share of trips starting in Harbourside, Old Town and Kestrel Hill: 82%. Nine eastern stations: 6%.',
};

export const LEDGER_ARTICLE: Source = {
    title: 'Half a million rides? What the bike-share numbers count',
    url: 'https://merrowledger.example.org/2026/04/bike-share-numbers',
    publisher: 'The Merrow Ledger',
    snippet: 'The council’s “half a million rides” counts every unlock. The operator’s own report, which drops false starts, says 412,000.',
    keywords: ['merrow', 'wheels', 'bike-share', 'rides', 'numbers', 'ridership', 'first', 'year'],
    text: 'The council\'s figure of 503,000 rides counts every unlock, including 91,000 trips shorter than two minutes — '
        + 'mostly riders swapping a bike with a flat tyre or a low battery. The operator\'s report excludes them.',
};

export const MEMBER_SURVEY: Source = {
    title: 'Who rides? Member survey, winter 2026',
    url: 'https://urbanmobility.example.org/briefs/merrow-member-survey',
    publisher: 'Northfield Institute for Urban Mobility',
    snippet: 'Survey of 1,240 Merrow Wheels members: 31% of their trips replaced a car or taxi journey, 44% a walk or a bus.',
    keywords: ['merrow', 'wheels', 'member', 'survey', 'car', 'trips', 'replaced', 'riders'],
    text: 'Sample: 1,240 annual members, January 2026, self-reported. Trips that replaced a car or taxi: 31%. '
        + 'Replaced a walk: 25%. Replaced a bus: 19%. New trips that would not have been made: 25%. Casual riders were not surveyed.',
};

export const FORUM_THREAD: Source = {
    title: 'Eastern districts still waiting for docks',
    url: 'https://cyclingforum.example.org/threads/eastern-docks',
    publisher: 'Port Merrow Cycling Forum',
    snippet: 'Fenwick and Saltmarsh have nine stations between them. Residents say the nearest dock is a twenty-minute walk.',
    keywords: ['merrow', 'stations', 'docks', 'eastern', 'survey', 'riders'],
    text: 'Forum thread, 64 replies. Residents of Fenwick and Saltmarsh describe gaps between stations of up to 1.5 km.',
};

export const SOURCES: Source[] = [OPERATOR_REPORT, TRIP_DATA, LEDGER_ARTICLE, MEMBER_SURVEY, FORUM_THREAD];

/** The sources a query finds: the ones sharing the most words with it, best first, three at most. */
export function search(query: string): Source[] {
    const words = query.toLowerCase().split(/[^a-z-]+/).filter(Boolean);
    return SOURCES
        .map((source) => ({ source, score: words.filter((word) => source.keywords.includes(word)).length }))
        .filter(({ score }) => score > 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ source }) => source);
}

export function sourceAt(url: string): Source | undefined {
    return SOURCES.find((source) => source.url === url);
}

/** A URL as a result card prints it: the host, without the scheme. */
export function domainOf(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}
