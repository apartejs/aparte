/**
 * @aparte/plugin-cards
 *
 * Rich cards for aparté: a tool's result drawn as a card instead of a row — the weather
 * first, each card behind its own entry so an app ships only the ones it draws:
 *
 *   import { setupWeatherCard } from '@aparte/plugin-cards/weather';
 *   setupWeatherCard({ tool: 'get_weather', map: (r) => ({ location: r.city, temperature: r.temp_c }) });
 *
 * This entry is the kit every card is made with — `defineCard`, the `card` segment, the
 * formatters and the sparkline — for a card of your own that behaves like ours: the same
 * three sources, states, variants, language switch and actions.
 */
export { defineCard, CARD_SEGMENT_TYPE } from './kit/define.js';
export type {
    AparteCardSegment,
    CardAction,
    CardActionEventDetail,
    CardChangeEventDetail,
    CardContext,
    CardDefinition,
    CardSetupOptions,
} from './kit/define.js';
export { el, glyph, safeUrl, webUrl, num, str } from './kit/dom.js';
export { formatNumber, formatPercent, formatPrice, currencyCode, formatUnit, formatDay, formatHour, formatWhen, toDate } from './kit/format.js';
export { sparkline, sparklinePath } from './kit/sparkline.js';
export type { SparklineOptions } from './kit/sparkline.js';
export { rating } from './kit/rating.js';
export type { RatingOptions } from './kit/rating.js';
export { carousel } from './kit/carousel.js';
export { segmented, toggle, slider } from './kit/controls.js';
export type { SegmentedOptions, ToggleOptions, SliderOptions } from './kit/controls.js';
export type { CarouselOptions } from './kit/carousel.js';
export { word, languageOf, intlTag } from './kit/strings.js';
export type { CardWord, CardLanguage } from './kit/strings.js';
