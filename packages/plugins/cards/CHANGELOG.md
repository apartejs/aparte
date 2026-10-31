# @aparte/plugin-cards

## 0.29.2

### Patch Changes

- df050ad: A card written as a ` ```card-<name> ` block is drawn on its own, without the code card's header, language label and copy button around it.

  Core: a code-language renderer can say `bare: true` — its drawing then stands for the whole fenced block, and the code card around it goes. Diagrams, charts and maths keep their card and the copy of their source. `setupCardFences()` sets it.

  A link in the person's own bubble (an email or a URL they typed) now takes the bubble's text colour, underlined: it was drawn in the link colour, which on a bubble filled with the primary was the bubble's own colour.

## 0.29.1

### Patch Changes

- Add `setupCardFences()`: a ` ```card-weather ` code block of JSON in an answer is drawn as the weather card (every card has its `card-<name>` language).

  For backends that send only text and keep their tool calls to themselves — a workflow engine, a server that streams its answer, a model with no tools. `load` maps a card's name to its entry (`() => import('@aparte/plugin-cards/weather')`), fetched the first time a block names it. While the block streams a placeholder holds its place; a block whose JSON does not parse, or whose card the page cannot draw, shows its source. Works with any Markdown provider, or none.

## 0.29.0

### Minor Changes

- 324d2ba: New package: `@aparte/plugin-cards` draws a tool's result as a rich card instead of a row. Import one card's entry and call its setup, e.g. `setupWeatherCard({ tool: 'get_weather', map })`.

  Eleven cards, each its own entry so an app ships only the ones it imports: `weather`, `items` (articles and search results), `product`, `place`, `stats` (key figures), `order` (orders and bookings), `stock` (a quote with its line or candlestick chart), `plan` (an agent's task list, updated in place), `score` (matches), `media` (pictures, videos, sounds, with a lightbox) and `link` (a page preview). Each has three or four variants, chosen by name or by a function of the data, and a reader that already takes the shapes the usual APIs return (Open-Meteo, Shopify, Stripe, Google Places, Yahoo Finance, API-Football, Open Graph…); `map` turns your tool's own fields into the card's. While the call runs the card shows its skeleton; a call refused, stopped or failed is one line that says so, never a card. Every card is also a `card` segment (`weatherCard.segment(data)`) with a fallback sentence for a text-only reader, and its words come in the ten languages of `@aparte/locales`, rewritten in place on a language switch.

  A card can answer back: with an `onChange`, the stock card draws range buttons over its chart, and what `onChange` returns is drawn in place — the same element, the focus kept. Changes run one at a time, each from the data the one before left, and what they returned is kept while the page lives: a turn ending, the conversation saved or reopened, in every framework, draws the card as the person left it. A button the app declares (`actions`) can open a link, send a message or only report; a button read from a tool's result can only be a web link or an `id`, never text sent as the person. Setting a card up twice stacks: the newer setup draws, and removing the older one leaves it in place. The root entry is the kit the cards are made with (`defineCard`, `segmented`, `toggle`, `slider`, `carousel`, `sparkline`, the `Intl` formatters), for a card of your own that behaves the same way.
