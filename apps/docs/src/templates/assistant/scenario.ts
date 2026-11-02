/**
 * What the Assistant's scripted model says. Everything else on the page is the real library; only
 * the model is a script, so the template answers without a key and the same way every time.
 *
 * The answers are exported because the seeded conversations (conversations.ts) are made of the
 * same words: retrying a seeded reply asks this script again, and gets the reply it is retrying.
 * The people, places and figures are invented.
 */
import type { AparteChatRequest } from '@aparte/core';
import { defaultMatch } from '@aparte/provider-scenario';
import type { Scenario, ScenarioTurn } from '@aparte/provider-scenario';

export const SALES_QUESTION =
    'Here is the shop’s order export. Which regions grew, and how do I redo this next quarter?';

// A reasoning block in two steps with a pause between them, so a live turn is seen thinking.
const SALES_READ = 'One row per order: date, region, total. Sum the totals per region and quarter, compare Q3 with Q2. ';
const SALES_PLAN = 'Call out what moved most; a short pandas script makes it repeatable next quarter.';
export const SALES_THINKING = SALES_READ + SALES_PLAN;

export const SALES_ANSWER = `Three of four regions grew, and revenue rose **9.2 %** to **€184,260**. This redoes it on any export:

\`\`\`python
orders = pd.read_csv("orders.csv", parse_dates=["date"])
by_q = orders.groupby(["region", orders.date.dt.quarter]).total.sum()
print(by_q.unstack().pct_change(axis=1) * 100)
\`\`\`

| Region | Q2 | Q3 | Change |
| --- | ---: | ---: | ---: |
| North | €41,900 | €49,120 | +17.2 % |
| Coast | €38,450 | €44,700 | +16.3 % |
| Central | €52,300 | €55,890 | +6.9 % |
| Highlands | €36,100 | €34,550 | −4.3 % |`;

export const TRIP_QUESTION = 'Find me a quiet weekend near Lake Varden in early November: somewhere to walk, and a good place to eat.';

export const TRIP_QUERY = 'Lake Varden quiet weekend November walks';

/** What the `web_search` tool returns: three invented pages. */
export const TRIP_RESULTS = JSON.stringify(
    [
        { title: 'Varden Valley trail guide', url: 'https://example.org/varden-trails', snippet: 'The 11 km shore loop from Brennick is flat and stays open all winter.' },
        { title: 'Brennick in the off-season', url: 'https://example.org/brennick-winter', snippet: 'After October the guesthouses halve their rates; the ferry runs weekends only.' },
        { title: 'The Ashgrove Kitchen', url: 'https://example.com/ashgrove', snippet: 'Wood-fired, local trout, open Friday to Sunday. Book two days ahead.' },
    ],
    null,
    2,
);

export const TRIP_ANSWER = `Early November is a good time: the lake is quiet and the guesthouses are cheaper.

## Two days at Lake Varden

1. **Saturday.** Walk the 11 km **shore loop** from Brennick: flat, about three hours, with a café halfway at the ferry pier.
2. **Saturday evening.** Dinner at **The Ashgrove Kitchen** (wood-fired, local trout). Book two days ahead.
3. **Sunday.** Take the weekend ferry across to the north shore and back before the light goes, around 16:30.

Sources: [Varden Valley trail guide](https://example.org/varden-trails), [Brennick in the off-season](https://example.org/brennick-winter), [The Ashgrove Kitchen](https://example.com/ashgrove).`;

export const BREAD_QUESTION = 'My sourdough recipe uses 500 g of flour, 350 g of water, 100 g of starter and 10 g of salt. Scale it to 750 g of flour.';

/** The first version of the reply. The second, below, is the one the conversation shows. */
export const BREAD_ANSWER_TABLE = `Everything goes up by half (×1.5):

| Ingredient | Now | Scaled |
| --- | ---: | ---: |
| Flour | 500 g | 750 g |
| Water | 350 g | 525 g |
| Starter | 100 g | 150 g |
| Salt | 10 g | 15 g |

Keep the same timings; a bigger dough may need a slightly longer bulk rise.`;

export const BREAD_ANSWER_PERCENT = `In baker’s percentages your recipe is **70 % water, 20 % starter, 2 % salt**, so for 750 g of flour:

- **Water:** 525 g
- **Starter:** 150 g
- **Salt:** 15 g

Those percentages scale any batch: multiply the flour by each one.`;

export const INVOICE_QUESTION = 'Help me write a polite reminder to a client whose invoice is a month late.';

export const INVOICE_ANSWER = `Here is a short, friendly reminder you can adapt:

> **Subject:** Invoice FW-2026-0412, a quick reminder
>
> Hi Jonas,
>
> I hope the autumn is treating you well. A quick note that invoice FW-2026-0412 (€2,400, due 14 September) is still open on our side. If it has already gone out, please ignore this; otherwise, could you let me know when we can expect it?
>
> Thanks, and happy to resend it if that helps.
>
> Maya

Keep the first reminder warm: most late payments are an invoice that went to the wrong inbox.`;

export const REGEX_QUESTION = 'Write a regex that matches order numbers like FW-2026-004812.';

export const REGEX_ANSWER = `Two letters, a four-digit year and a six-digit number:

\`\`\`ts
const ORDER_NUMBER = /^[A-Z]{2}-\\d{4}-\\d{6}$/;

ORDER_NUMBER.test('FW-2026-004812'); // true
ORDER_NUMBER.test('FW-26-4812');     // false
\`\`\`

- \`^\` and \`$\` anchor it, so it matches the whole string and nothing around it.
- Drop them to find order numbers inside a longer text, and add the \`g\` flag.`;

export const PHOTOS_QUESTION = 'Write a Python script that renames my photos by the date they were taken.';

/**
 * What the landing's showcase types, once it is on screen: a short think, a tool call drawn as
 * a weather card, then the answer. Brennick is the trip conversation's invented town.
 */
export const PLAY_QUESTION = 'Is it good walking weather in Brennick today? I’d like to do the shore loop.';

const WEATHER_THINKING = 'A walking question is a weather question: check the next hours in Brennick. ';
const WEATHER_PLAN = 'The shore loop is 11 km, about three hours, so it has to fit before any rain.';

const WEATHER_ANSWER = `Yes, if you leave soon: it stays dry for the next four hours, then rain moves in off the lake.

- **The loop** takes about three hours, so start within the hour and you are back before it turns.
- **Take a light jacket:** the wind off the water makes 12° feel like 9°.
- **Halfway**, the café at the ferry pier is a good place to wait out a shower if it comes early.`;

/**
 * What `get_weather` returns for Brennick, from the hour the call is made: mild and cloudy, rain
 * from the fifth hour. Built on each call, so the card's hours are always the next ones.
 */
export function brennickWeather(now = Date.now()): string {
    const hour = Math.floor(now / 3_600_000) * 3_600_000;
    const temperatures = [12, 12, 13, 13, 12, 11, 10, 9];
    return JSON.stringify({
        location: 'Brennick', condition: 'partly-cloudy', temperature: 12, feelsLike: 9, high: 13, low: 7,
        humidity: 74, wind: { speed: 19, direction: 250 }, precipitation: 30,
        hourly: temperatures.map((temperature, i) => ({
            time: new Date(hour + i * 3_600_000).toISOString(), temperature,
            condition: i > 3 ? 'rain' : 'partly-cloudy', precipitation: i > 3 ? 70 : 10,
        })),
    });
}

const PHOTOS_THINKING = 'The date a photo was taken is in its EXIF data, not the file’s own timestamp. ';
const PHOTOS_PLAN = 'Read it with Pillow, and leave a photo alone when it has no date.';

const PHOTOS_ANSWER = `This renames each photo to its date taken, like \`2026-10-14_093012.jpg\`. Install Pillow first (\`pip install Pillow\`):

\`\`\`python
from datetime import datetime
from pathlib import Path
from PIL import Image
for photo in Path("Holiday").glob("*.jpg"):
    with Image.open(photo) as img:
        taken = img.getexif().get_ifd(0x8769).get(36867)  # DateTimeOriginal
    if taken:
        when = datetime.strptime(taken, "%Y:%m:%d %H:%M:%S")
        photo.rename(photo.with_name(f"{when:%Y-%m-%d_%H%M%S}.jpg"))
\`\`\``;

export const INTEREST_QUESTION = 'Explain compound interest with a small table.';

const INTEREST_ANSWER = `**Compound interest** is interest on the interest: each year’s gain is added to the balance, and next year’s rate applies to the larger sum.

| Year | Simple, 5 % | Compound, 5 % |
| --- | ---: | ---: |
| 0 | €1,000 | €1,000.00 |
| 1 | €1,050 | €1,050.00 |
| 5 | €1,250 | €1,276.28 |
| 10 | €1,500 | €1,628.89 |
| 20 | €2,000 | €2,653.30 |

After 20 years, compounding has earned €653 more than simple interest.`;

export const TODO_QUESTION =
    'Turn these meeting notes into a to-do list: ship the beta on Friday, Sam reviews the docs first, book a room for the launch, and send the quotes by the 30th.';

const TODO_ANSWER = `Here are the actions, in the order they have to happen:

1. **Sam**: review the docs, *before Friday*, since the beta ships with them.
2. **You**: ship the beta, *Friday*.
3. **No owner yet**: book a room for the launch. Worth doing this week.
4. **No owner yet**: send the quotes, *by the 30th*.

Two items have no owner. Shall I draft a message asking who takes them?`;

export const FRENCH_QUESTION = 'Translate into French: “The meeting moved to Thursday at 10. Please bring the slides.”';

const FRENCH_ANSWER = `> La réunion est déplacée à jeudi, 10 h. Merci d’apporter les diapositives.

*Merci d’apporter* is the polite way to say “please bring” in a work message. Between colleagues who say *tu*, « Tu peux apporter les diapos ? » sounds more natural.`;

/**
 * The script, by scenario. `pause` is the wait inside a reasoning block, between its two steps:
 * the caller passes 0 under reduced motion, where a reply lands at once.
 */
export const scenarios = (pause: number): Record<string, Scenario | ScenarioTurn> => ({
    default:
        'I can summarise a file, plan a trip, explain an idea or write some code. Try one of the suggestions, or ask your own question.',
    weather: {
        when: /weather|shore loop/i,
        turn: [{ thinking: WEATHER_THINKING }, { wait: pause }, { thinking: WEATHER_PLAN }, { tool: 'get_weather', input: { city: 'Brennick' } }],
    },
    weatherFast: [{ tool: 'get_weather', input: { city: 'Brennick' } }],
    weatherAnswer: { after: 'get_weather', turn: WEATHER_ANSWER },
    photos: {
        when: /photo/i,
        turn: [{ thinking: PHOTOS_THINKING }, { wait: pause }, { thinking: PHOTOS_PLAN }, { text: PHOTOS_ANSWER }],
    },
    // The Fast model answers without reasoning, so it has no thinking step to wait in.
    photosFast: [{ text: PHOTOS_ANSWER }],
    salesFast: [{ text: SALES_ANSWER }],
    sales: {
        when: /region|export|sales/i,
        turn: [{ thinking: SALES_READ }, { wait: pause }, { thinking: SALES_PLAN }, { text: SALES_ANSWER }],
    },
    trip: {
        when: /weekend|trip|varden/i,
        turn: [{ tool: 'web_search', input: { query: TRIP_QUERY } }],
    },
    tripAnswer: { after: 'web_search', turn: TRIP_ANSWER },
    bread: { when: /sourdough|flour/i, turn: BREAD_ANSWER_PERCENT },
    invoice: { when: /invoice|reminder/i, turn: INVOICE_ANSWER },
    regex: { when: /regex|order number/i, turn: REGEX_ANSWER },
    interest: { when: /interest/i, turn: INTEREST_ANSWER },
    todo: { when: /to-do|meeting notes/i, turn: TODO_ANSWER },
    french: { when: /french/i, turn: FRENCH_ANSWER },
});

/** The scenario that answers the Fast model, where there is one: the same answer, no reasoning. */
export const pickScenario = (request: AparteChatRequest, all: Record<string, Scenario>): string | undefined => {
    const key = defaultMatch(request, all);
    return request.modelId === 'fast' && key && `${key}Fast` in all ? `${key}Fast` : key;
};

/** A new conversation's title, from its first question: short, for a scripted model that knows them. */
const TITLES = new Map([
    [PLAY_QUESTION, 'Walking weather in Brennick'],
    [PHOTOS_QUESTION, 'Rename photos by date'],
    [TRIP_QUESTION, 'A quiet weekend at Lake Varden'],
    [INTEREST_QUESTION, 'Compound interest, in a table'],
    [INVOICE_QUESTION, 'Reminder for a late invoice'],
    [SALES_QUESTION, 'Which regions grew?'],
    [TODO_QUESTION, 'Meeting notes to a to-do list'],
    [FRENCH_QUESTION, 'A note in French'],
]);

export const titleFor = (text: string): string => TITLES.get(text) ?? text.replace(/[.?!\s]+$/, '');
