/**
 * What the research assistant's scripted model says and does. Everything else on the page is
 * the real library; only the model is a script, so the template answers without a key and the
 * same way every time.
 *
 * One research run is four calls to the model, chained by the tool each one waits for: plan
 * and search, then read what the searches found, then write the report with create_artifact,
 * then answer. Each `after` names the tool whose result the next call answers.
 */
import type { Scenario, ScenarioTurn } from '@aparte/provider-scenario';
import { LEDGER_ARTICLE, MEMBER_SURVEY, OPERATOR_REPORT, TRIP_DATA, type Source } from './sources';

/** A numbered citation: a link to the source, titled with the page's name so the bare digit has a description. */
const cite = (n: number, source: Source): string => `[[${n}](${source.url} "${source.title}")]`;

/** The question the landing's showcase types, and the run's trigger. */
export const PLAY_QUESTION = 'How did Merrow Wheels do in its first year? Write me a short report with sources.';

/** The second starter: answered in one reply, no run. */
export const WEIGH_QUESTION = 'How do you choose and weigh your sources?';

export const SUGGESTIONS = [
    { label: 'Bike-share, year one', prompt: PLAY_QUESTION },
    { label: 'How you pick sources', prompt: WEIGH_QUESTION },
];

export const PLAN = `The question is about outcomes, so the operator's own numbers come first, then something independent to check them against.

1. Find the operator's year-one report and the city's open trip data.
2. Look for independent coverage: local press, a rider survey.
3. Read the primary sources; note where figures disagree, and why.
4. Write a short report: summary, monthly trend, key figures, open questions, numbered sources.`;

export const STARTING = "Starting with the operator's own numbers, then an independent check.";

export const SEARCHES = ['Merrow Wheels first year ridership', 'member survey Merrow riders stations'];

export const READS = [OPERATOR_REPORT.url, TRIP_DATA.url, LEDGER_ARTICLE.url, MEMBER_SURVEY.url];

export const REPORT_TITLE = 'Merrow Wheels: the first year';

/**
 * The report, as the model writes it: Markdown, with the chart's data in a fenced `chart` block
 * that the report pane draws (report.ts). A model writes data well and SVG badly, and the
 * library's sanitiser refuses SVG in model output anyway.
 */
export const REPORT = `# ${REPORT_TITLE}

Desk research · Port Merrow, April 2025 – March 2026 · *Illustrative data about a fictional city*

## Summary

Merrow Wheels logged **412,000 trips** in its first twelve months, about 1,130 a day, from 60 stations and 600 bikes ${cite(1, OPERATOR_REPORT)}. Ridership peaked in September and fell by almost two thirds over the winter ${cite(2, TRIP_DATA)}. E-bikes are 40% of the fleet but carry 57% of the trips ${cite(1, OPERATOR_REPORT)}. The "half a million rides" quoted by the council counts every unlock, false starts included ${cite(3, LEDGER_ARTICLE)}.

## Trips per month

\`\`\`chart
{"unit": "k", "caption": "Thousands of trips, April 2025 – March 2026", "labels": ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"], "values": [24.1, 33.8, 42.4, 47.1, 46.8, 49.6, 41.3, 29.9, 21.3, 17.9, 22.6, 35.2]}
\`\`\`

## Key figures

| Measure | Year one | Source |
| --- | --- | --- |
| Trips | 412,000 | ${cite(1, OPERATOR_REPORT)} |
| Annual members | 9,400 | ${cite(1, OPERATOR_REPORT)} |
| Trips made by members | 61% | ${cite(1, OPERATOR_REPORT)} |
| Trips made on e-bikes | 57% | ${cite(1, OPERATOR_REPORT)} |
| Average trip | 14 min · 2.3 km | ${cite(2, TRIP_DATA)} |
| Member trips that replaced a car or taxi | 31% | ${cite(4, MEMBER_SURVEY)} |
| Collisions per 100,000 trips | 5.6 | ${cite(1, OPERATOR_REPORT)} |

## Findings

1. **Demand is seasonal and central.** 82% of trips start in Harbourside, Old Town and Kestrel Hill; the nine eastern stations see 6% ${cite(2, TRIP_DATA)}.
2. **E-bikes do the heavy lifting.** They carry more than half the trips on less than half the fleet, which argues for electrifying the next order ${cite(1, OPERATOR_REPORT)}.
3. **The two ride counts agree once defined.** 503,000 unlocks minus 91,000 trips under two minutes is the operator's 412,000 ${cite(3, LEDGER_ARTICLE)}.
4. **Some car trips are being replaced.** Members say 31% of their trips replaced a car or taxi. Self-reported, and members only ${cite(4, MEMBER_SURVEY)}.

## Open questions

- Does winter ridership recover in year two, or is the January low the floor?
- Would more stations in Fenwick and Saltmarsh raise the eastern share, or is demand there lower?

## Sources

1. [${OPERATOR_REPORT.title}](${OPERATOR_REPORT.url}) — ${OPERATOR_REPORT.publisher}
2. [${TRIP_DATA.title}](${TRIP_DATA.url}) — ${TRIP_DATA.publisher}
3. [${LEDGER_ARTICLE.title}](${LEDGER_ARTICLE.url}) — ${LEDGER_ARTICLE.publisher}
4. [${MEMBER_SURVEY.title}](${MEMBER_SURVEY.url}) — ${MEMBER_SURVEY.publisher}
`;

export const READING = 'The operator\'s report and the open data are primary; the Ledger piece and the survey give an outside check. Reading all four.';

export const ANSWER = `**${REPORT_TITLE}** is in the pane: 412,000 trips in the first year, strongly seasonal, with e-bikes carrying most of them ${cite(1, OPERATOR_REPORT)}.

One caveat: the car-trip figure comes from a members-only survey ${cite(4, MEMBER_SURVEY)}.`;

/** What a finished run reports, so the context gauge reads a realistic share of the window. */
export const RUN_USAGE = { inputTokens: 38200, outputTokens: 1450, totalTokens: 39650 };

const SOURCES_ANSWER = `I weigh a source by how close it is to the data:

1. **Primary first**: the operator's own reports and the city's open data.
2. **Independent checks next**: research institutes and surveys, with their sample size and method.
3. **Press and forums for context**: they point at questions, and I check their figures against 1 and 2.

When two sources disagree I say so in the report and explain why, as with the two ride counts in *${REPORT_TITLE}*.`;

const CARGO_ANSWER = `Here is how the three compare on cost for a city of Port Merrow's size, using the brief's typical figures:

| Scheme | Cost per bike | Reach |
| --- | --- | --- |
| Purchase grant | about 900 | households that were already buying |
| Month-long trial | about 150 | people who have never ridden one |
| Business lease | about 1,400 | delivery fleets, slowest to start |

A trial scheme is the cheapest way to find out whether demand is there, and a lease is where the van trips are. I would pilot the trial first, then size a lease for the Harbourside depots. Say the word and I will write it up as a report with sources.`;

export const SCENARIOS: Record<string, Scenario | ScenarioTurn> = {
    default: 'I research a question across sources and write it up as a report with citations. Start with **Bike-share, year one** and I will show how it goes.',
    cargo: { when: /cargo|costs?\b|^\s*yes\b/i, turn: CARGO_ANSWER },
    research: {
        when: /merrow wheels|bike-share|first year/i,
        turn: [
            { thinking: PLAN },
            // The first text ends the reasoning block, so its label reads "Thought for…" while the searches run.
            { text: STARTING },
            ...SEARCHES.map((query) => ({ tool: 'web_search', input: { query } })),
        ],
    },
    // After `research`: its question asks for sources too, and the first `when` that matches wins.
    sources: { when: /source/i, turn: SOURCES_ANSWER },
    read: {
        after: 'web_search',
        turn: [{ text: READING }, ...READS.map((url) => ({ tool: 'read_page', input: { url } }))],
    },
    write: {
        after: 'read_page',
        turn: [{ tool: 'create_artifact', input: { mimeType: 'text/markdown', title: REPORT_TITLE, content: REPORT } }],
    },
    answer: { after: 'create_artifact', turn: [{ text: ANSWER }, { usage: RUN_USAGE }] },
};
