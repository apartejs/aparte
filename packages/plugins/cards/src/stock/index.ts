/**
 * @aparte/plugin-cards/stock — a market quote, drawn with its chart.
 *
 *   import { setupStockCard } from '@aparte/plugin-cards/stock';
 *
 *   setupStockCard({ tool: 'get_quote' });
 *
 * A stock, an index, a crypto-currency or a currency pair: whatever has a symbol and a
 * price. Four variants of one card: `chart` (the quote at length — the price, the change,
 * the chart against the previous close, the day's figures), `compact` (a row per quote,
 * its sparkline in the change's colour), `ticker` (a strip of quotes that scrolls
 * sideways, like a market ticker — static, nothing moves on its own) and `candles` (the
 * `chart` card with a candlestick chart in place of the line).
 *
 * Several quotes in `chart` or `candles` are drawn as `compact` rows: a watchlist is read
 * by comparing its lines, and a carousel of charts would show one quote at a time — the
 * opposite of a watchlist — at a width (a slide) the chart cannot use. A quote asked for
 * in `candles` that has no candles is drawn with the line chart, from its series: the
 * card shows what it has rather than an empty frame.
 *
 * Your tool keeps its own fields: `readQuotes` already reads Yahoo Finance's quote and
 * chart, Alpha Vantage's `GLOBAL_QUOTE`, Finnhub's quote (when a `symbol` is given beside
 * it), CoinGecko's markets and OHLC, Binance's klines — and `map` covers the rest.
 *
 * **Range buttons.** Give a quote the `ranges` your app can serve and an `onChange` that
 * serves them: the card draws a row of buttons over its chart, and a press asks your app
 * for the quote over that range, drawn in place — the same element, the focus kept on the
 * pressed button. Without an `onChange` no button is drawn: one that does nothing would be
 * a promise the card cannot keep.
 *
 *   setupStockCard({
 *     tool: 'get_quote',
 *     map: (result) => ({ ...result, ranges: ['1D', '5D', '1M', '6M', '1Y', '5Y'] }),
 *     onChange: async ({ name, value }, data) => {
 *       const [quote] = data.quotes;
 *       if (name !== 'range' || !quote) return;
 *       const chart = await fetch(`/api/chart?symbol=${quote.symbol}&range=${value}`).then((r) => r.json());
 *       // The quote as it was, over the new range: say the range, and send its series
 *       // (and its candles, for the `candles` variant) — the old ones would be kept.
 *       return { ...quote, range: value, series: chart.series, candles: chart.candles };
 *     },
 *   });
 *
 * The baseline follows the range: the previous close for a day, where the series starts
 * for anything longer.
 */
import type { AparteConfig } from '@aparte/core';
import { defineCard, type CardContext, type CardSetupOptions } from '../kit/define.js';
import { el, glyph, num, str, webUrl } from '../kit/dom.js';
import { currencyCode, formatHour, formatNumber, formatWhen, toDate } from '../kit/format.js';
import { sparkline } from '../kit/sparkline.js';
import { intlTag, word, type CardWord } from '../kit/strings.js';
import { segmented } from '../kit/controls.js';
import { candleChart, priceChart, thin, type Candle, type ChartPoint } from './chart.js';
import { CHART, DOWN, UP } from './icons.js';
import stockStyles from './stock.css?raw';

export type StockVariant = 'chart' | 'compact' | 'ticker' | 'candles';

export type { Candle, ChartPoint } from './chart.js';

/** Where the market stands for this quote. */
export type MarketState = 'open' | 'closed' | 'pre' | 'post';

/** A range the chart covers: one of the usual, or a label of your own ("YTD"). */
export type StockRange = '1D' | '5D' | '1M' | '6M' | '1Y' | '5Y' | (string & {});

/**
 * One quote as `map` returns it. `symbol` and `price` are needed — a quote given only
 * candles or a series takes its last close as its price — and every other field adds a
 * line when it is there and nothing when it is not.
 *
 * The change is derived from what is given, and only what is missing is derived — a value
 * the tool gives is never recomputed, so its own rounding stands: `change` from
 * `previousClose`, then `previousClose` from `change` (or, failing that, from
 * `changePercent`), then `changePercent` from the two. When `changePercent` and
 * `previousClose` are both given, both are shown as given and the chart's baseline is the
 * given `previousClose`.
 */
export interface QuoteInput {
    symbol: string;
    name?: string;
    exchange?: string;
    price?: number | string;
    /** An ISO 4217 code (`USD`) or a usual symbol (`$`). */
    currency?: string;
    /** The change since the previous close, in the currency. */
    change?: number | string;
    /** The change in percent: `0.85` is +0.85 %. `"0.85%"` reads too. */
    changePercent?: number | string;
    previousClose?: number | string;
    open?: number | string;
    high?: number | string;
    low?: number | string;
    volume?: number | string;
    marketCap?: number | string;
    yearHigh?: number | string;
    yearLow?: number | string;
    /** The chart: values in time order, or `{ time, value }` points (also `[time, value]` pairs). */
    series?: number[] | Array<{ time: string | number | Date; value: number }>;
    /**
     * The `candles` variant's chart, in time order. Also read: Yahoo's chart result
     * (`timestamp` + `indicators.quote[0]`), Binance's klines and CoinGecko's OHLC
     * (`[time, open, high, low, close, volume?]` arrays, numbers or strings), and
     * `{ t, o, h, l, c, v }` objects. A quote with candles and no series draws its line
     * from the closes.
     */
    candles?: Array<{ time: string | number | Date; open: number | string; high: number | string; low: number | string; close: number | string; volume?: number | string }>;
    /** The range the series (or the candles) covers. */
    range?: StockRange;
    /** The ranges your app can serve: drawn as buttons over the chart when the card has an `onChange`. */
    ranges?: StockRange[];
    marketState?: MarketState;
    /** When the price was: an ISO string, an epoch (seconds or milliseconds) or a Date. */
    time?: string | number | Date;
    /** Where the symbol links to; `http(s)` only. */
    url?: string;
}

/** What `map` returns: one quote, a list (a watchlist), or a list with a heading. */
export type QuotesInput = QuoteInput | QuoteInput[] | { title?: string; quotes: QuoteInput[] };

/** One quote as the card draws it, once read. */
export interface Quote {
    symbol: string;
    name?: string;
    exchange?: string;
    price: number;
    /** An ISO 4217 code. */
    currency?: string;
    change?: number;
    /** In percent: `0.85` is +0.85 %. */
    changePercent?: number;
    previousClose?: number;
    open?: number;
    high?: number;
    low?: number;
    volume?: number;
    marketCap?: number;
    yearHigh?: number;
    yearLow?: number;
    /** In time order, at most 2000 points; the candles' closes when only candles were given. */
    series: ChartPoint[];
    /** In time order, at most 2000. */
    candles: Candle[];
    range?: string;
    ranges?: string[];
    marketState?: MarketState;
    time?: Date;
    url?: string;
}

/** The data as the card draws it. */
export interface StockData {
    /** The heading over several quotes ("Tech watchlist"). */
    title?: string;
    quotes: Quote[];
}

const S = {
    cardsStockTitle: { en: 'Market quote', fr: 'Cours de bourse', de: 'Börsenkurs', es: 'Cotización', it: 'Quotazione', ja: '株価', ko: '시세', pt: 'Cotação', ru: 'Котировка', zh: '行情' },
    cardsStockCount: { en: '{n} quotes', fr: '{n} cours', de: '{n} Kurse', es: '{n} cotizaciones', it: '{n} quotazioni', ja: '{n}件の銘柄', ko: '종목 {n}개', pt: '{n} cotações', ru: 'Котировок: {n}', zh: '{n} 个行情' },
    cardsStockMarketOpen: { en: 'Market open', fr: 'Marché ouvert', de: 'Markt geöffnet', es: 'Mercado abierto', it: 'Mercato aperto', ja: '取引時間中', ko: '장 운영 중', pt: 'Mercado aberto', ru: 'Рынок открыт', zh: '交易中' },
    cardsStockMarketClosed: { en: 'Market closed', fr: 'Marché fermé', de: 'Markt geschlossen', es: 'Mercado cerrado', it: 'Mercato chiuso', ja: '取引終了', ko: '장 마감', pt: 'Mercado fechado', ru: 'Рынок закрыт', zh: '已收盘' },
    cardsStockPreMarket: { en: 'Pre-market', fr: 'Pré-ouverture', de: 'Vorbörslich', es: 'Preapertura', it: 'Pre-mercato', ja: 'プレマーケット', ko: '장전 거래', pt: 'Pré-mercado', ru: 'Премаркет', zh: '盘前' },
    cardsStockAfterHours: { en: 'After hours', fr: 'Après-clôture', de: 'Nachbörslich', es: 'Poscierre', it: 'After hours', ja: 'アフターマーケット', ko: '시간외 거래', pt: 'After-market', ru: 'Постмаркет', zh: '盘后' },
    cardsStockAsOf: { en: 'As of {time}', fr: 'À {time}', de: 'Stand: {time}', es: 'A las {time}', it: 'Alle {time}', ja: '{time}時点', ko: '{time} 기준', pt: 'Às {time}', ru: 'На {time}', zh: '截至 {time}' },
    cardsStockOpen: { en: 'Open', fr: 'Ouverture', de: 'Eröffnung', es: 'Apertura', it: 'Apertura', ja: '始値', ko: '시가', pt: 'Abertura', ru: 'Открытие', zh: '开盘' },
    cardsStockHigh: { en: 'High', fr: 'Plus haut', de: 'Hoch', es: 'Máximo', it: 'Massimo', ja: '高値', ko: '고가', pt: 'Máxima', ru: 'Максимум', zh: '最高' },
    cardsStockLow: { en: 'Low', fr: 'Plus bas', de: 'Tief', es: 'Mínimo', it: 'Minimo', ja: '安値', ko: '저가', pt: 'Mínima', ru: 'Минимум', zh: '最低' },
    cardsStockPrevClose: { en: 'Prev. close', fr: 'Clôture veille', de: 'Vortag', es: 'Cierre anterior', it: 'Chiusura prec.', ja: '前日終値', ko: '전일 종가', pt: 'Fech. anterior', ru: 'Пред. закрытие', zh: '昨收' },
    cardsStockVolume: { en: 'Volume', fr: 'Volume', de: 'Volumen', es: 'Volumen', it: 'Volume', ja: '出来高', ko: '거래량', pt: 'Volume', ru: 'Объём', zh: '成交量' },
    cardsStockMarketCap: { en: 'Market cap', fr: 'Capitalisation', de: 'Marktkap.', es: 'Cap. bursátil', it: 'Capitalizzazione', ja: '時価総額', ko: '시가총액', pt: 'Valor de mercado', ru: 'Капитализация', zh: '市值' },
    cardsStockYearRange: { en: '52-week range', fr: 'Sur 52 semaines', de: '52-Wochen-Spanne', es: 'Rango de 52 semanas', it: 'Intervallo 52 settimane', ja: '52週レンジ', ko: '52주 범위', pt: 'Intervalo de 52 semanas', ru: 'Диапазон за 52 недели', zh: '52周范围' },
    cardsStockChart: {
        en: 'Price chart: low {low}, high {high}, last {last}', fr: 'Graphique du cours : plus bas {low}, plus haut {high}, dernier {last}',
        de: 'Kursverlauf: Tief {low}, Hoch {high}, zuletzt {last}', es: 'Gráfico de precio: mínimo {low}, máximo {high}, último {last}',
        it: 'Grafico del prezzo: minimo {low}, massimo {high}, ultimo {last}', ja: '価格チャート：安値 {low}、高値 {high}、現在 {last}',
        ko: '가격 차트: 저가 {low}, 고가 {high}, 현재 {last}', pt: 'Gráfico de preço: mínima {low}, máxima {high}, último {last}',
        ru: 'График цены: минимум {low}, максимум {high}, последняя {last}', zh: '价格走势：最低 {low}，最高 {high}，最新 {last}',
    },
    cardsStockRange: { en: 'Range', fr: 'Période', de: 'Zeitraum', es: 'Periodo', it: 'Periodo', ja: '期間', ko: '기간', pt: 'Período', ru: 'Период', zh: '时间范围' },
    cardsStockOhlc: {
        en: 'O {open} H {high} L {low} C {close}', fr: 'O {open} H {high} B {low} C {close}', de: 'E {open} H {high} T {low} S {close}',
        es: 'A {open} Máx {high} Mín {low} C {close}', it: 'A {open} Max {high} Min {low} C {close}', ja: '始 {open} 高 {high} 安 {low} 終 {close}',
        ko: '시 {open} 고 {high} 저 {low} 종 {close}', pt: 'A {open} Máx {high} Mín {low} F {close}', ru: 'О {open} Макс {high} Мин {low} З {close}',
        zh: '开 {open} 高 {high} 低 {low} 收 {close}',
    },
    cardsStockOhlcSaid: {
        en: 'Open {open}, high {high}, low {low}, close {close}', fr: 'Ouverture {open}, plus haut {high}, plus bas {low}, clôture {close}',
        de: 'Eröffnung {open}, Hoch {high}, Tief {low}, Schluss {close}', es: 'Apertura {open}, máximo {high}, mínimo {low}, cierre {close}',
        it: 'Apertura {open}, massimo {high}, minimo {low}, chiusura {close}', ja: '始値 {open}、高値 {high}、安値 {low}、終値 {close}',
        ko: '시가 {open}, 고가 {high}, 저가 {low}, 종가 {close}', pt: 'Abertura {open}, máxima {high}, mínima {low}, fechamento {close}',
        ru: 'Открытие {open}, максимум {high}, минимум {low}, закрытие {close}', zh: '开盘 {open}，最高 {high}，最低 {low}，收盘 {close}',
    },
    cardsStockChartRange: {
        en: 'Price chart, {range}: low {low}, high {high}, last {last}', fr: 'Graphique du cours, {range} : plus bas {low}, plus haut {high}, dernier {last}',
        de: 'Kursverlauf, {range}: Tief {low}, Hoch {high}, zuletzt {last}', es: 'Gráfico de precio, {range}: mínimo {low}, máximo {high}, último {last}',
        it: 'Grafico del prezzo, {range}: minimo {low}, massimo {high}, ultimo {last}', ja: '価格チャート（{range}）：安値 {low}、高値 {high}、現在 {last}',
        ko: '가격 차트({range}): 저가 {low}, 고가 {high}, 현재 {last}', pt: 'Gráfico de preço, {range}: mínima {low}, máxima {high}, último {last}',
        ru: 'График цены, {range}: минимум {low}, максимум {high}, последняя {last}', zh: '价格走势（{range}）：最低 {low}，最高 {high}，最新 {last}',
    },
} satisfies Record<string, CardWord>;

const MARKET_WORD: Record<MarketState, keyof typeof S> = {
    open: 'cardsStockMarketOpen',
    closed: 'cardsStockMarketClosed',
    pre: 'cardsStockPreMarket',
    post: 'cardsStockAfterHours',
};

/** Twelve: a watchlist past that is a screener, not an answer. */
const QUOTES_SHOWN = 12;
/** Points kept per series: a year of hours. The chart thins them to its width. */
const POINTS_KEPT = 2000;

// ── Reading ──────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);

/** The first of `keys` that `r` has a value for. */
function pick(r: Raw | undefined, keys: readonly string[]): unknown {
    if (!r) return undefined;
    for (const key of keys) if (r[key] !== undefined && r[key] !== null) return r[key];
    return undefined;
}

/** A percentage as a number of percent: `0.85`, `"0.85"`, Alpha Vantage's `"0.8500%"`. */
function percentOf(value: unknown): number | undefined {
    return typeof value === 'string' ? num(value.replace(/[%\s]/g, '')) : num(value);
}

/** A date written as a day only (`2024-01-05`, Alpha Vantage's trading day) is that day, here — not midnight in London. */
function readTime(value: unknown): Date | undefined {
    // An epoch of 0 is a field left empty (Finnhub's `t` for an unknown symbol), not 1970.
    if (value === 0) return undefined;
    if (typeof value === 'string') {
        const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
        if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    }
    return toDate(value) ?? undefined;
}

/**
 * The times of one series, read in ONE unit. Alone, an epoch under 10^12 is seconds
 * (`toDate`'s rule); in a series in milliseconds that starts before 2001-09-09, that rule
 * read the early points as seconds, dated them thirty thousand years ahead, and the sort put
 * them last. So the series decides: it is in milliseconds when any of its epochs passes
 * 10^11 — the year 5138 as seconds, which no market has traded in; 1973 as milliseconds.
 */
function readTimes(values: unknown[]): Array<Date | undefined> {
    const ms = values.some((v) => typeof v === 'number' && v >= 1e11);
    return values.map((v) => readTime(ms && typeof v === 'number' && v !== 0 ? new Date(v) : v));
}

/** Yahoo's `REGULAR`, `PREPRE`, `POSTPOST`; the plain words; a boolean "is open". */
function readMarketState(r: Raw): MarketState | undefined {
    const value = pick(r, ['marketState', 'market_state', 'marketStatus', 'market_status', 'session']);
    if (typeof value === 'string') {
        const key = value.toLowerCase().replace(/[^a-z]/g, '');
        if (['open', 'regular', 'trading', 'live'].includes(key)) return 'open';
        // Yahoo's `PREPRE` and `POSTPOST` are the hours AROUND the extended sessions: before the
        // pre-market opens, after the after-hours have closed. Nothing trades then.
        if (['closed', 'close', 'prepre', 'postpost'].includes(key)) return 'closed';
        if (key.startsWith('pre')) return 'pre';
        if (key.startsWith('post') || key.startsWith('after') || key === 'extended') return 'post';
        return undefined;
    }
    const open = pick(r, ['isOpen', 'is_open', 'marketOpen', 'market_open']);
    return typeof open === 'boolean' ? (open ? 'open' : 'closed') : undefined;
}

const VALUE_KEYS = ['value', 'price', 'close', 'c', 'y', 'adjClose', 'adj_close'];
const TIME_KEYS = ['time', 't', 'date', 'timestamp', 'datetime', 'x'];

/** The chart's points: numbers, `[time, value]` pairs (CoinGecko's `prices`), or objects. */
function readSeries(value: unknown): ChartPoint[] {
    if (!Array.isArray(value)) return [];
    const points: ChartPoint[] = [];
    const times = readTimes(value.map((item) => (Array.isArray(item) ? item[0] : isObject(item) ? pick(item, TIME_KEYS) : undefined)));
    value.forEach((item, i) => {
        const v = num(Array.isArray(item) ? item[1] : isObject(item) ? pick(item, VALUE_KEYS) : item);
        const time = times[i];
        if (v !== undefined) points.push(time ? { value: v, time } : { value: v });
    });
    // A series that names every point's time is put in time order: some APIs list the newest first.
    if (points.length > 1 && points.every((p) => p.time)) points.sort((a, b) => a.time!.getTime() - b.time!.getTime());
    return points.slice(-POINTS_KEPT);
}

/**
 * The candles from what a tool wrote: Yahoo's chart (the whole answer or one result),
 * `[time, open, high, low, close, volume?]` arrays (Binance's klines, CoinGecko's OHLC),
 * or objects. A candle missing a price is dropped; a high and a low the wrong way round are
 * swapped, then a high under the body or a low over it is widened to the body, so a candle
 * is never drawn inside out.
 */
function readCandles(value: unknown): Candle[] {
    let list = value;
    if (isObject(value)) {
        const chart = isObject(value['chart']) && Array.isArray(value['chart']['result']) ? value['chart']['result'][0] : value;
        const indicators = isObject(chart) && isObject(chart['indicators']) && Array.isArray(chart['indicators']['quote']) ? chart['indicators']['quote'][0] : undefined;
        const times = isObject(chart) ? chart['timestamp'] : undefined;
        if (!Array.isArray(times) || !isObject(indicators)) return [];
        const at = (key: string, i: number) => (Array.isArray(indicators[key]) ? (indicators[key] as unknown[])[i] : undefined);
        list = times.map((t, i) => ({ t, o: at('open', i), h: at('high', i), l: at('low', i), c: at('close', i), v: at('volume', i) }));
    }
    if (!Array.isArray(list)) return [];
    const rows: unknown[][] = list.map((item) => (Array.isArray(item)
        ? item
        : isObject(item)
            ? [pick(item, ['time', 't', 'date', 'timestamp', 'openTime']), pick(item, ['open', 'o']), pick(item, ['high', 'h']), pick(item, ['low', 'l']), pick(item, ['close', 'c']), pick(item, ['volume', 'v'])]
            : []));
    const times = readTimes(rows.map((row) => row[0]));
    const candles: Candle[] = [];
    rows.forEach(([, o, h, l, c, v], i) => {
        const open = num(o);
        const close = num(c);
        let high = num(h);
        let low = num(l);
        if (open === undefined || close === undefined || high === undefined || low === undefined) return;
        // A high under the low is the two fields swapped, not two wrong values: widening the
        // body alone would drop the true extreme (a low of 6 kept as a high of 5).
        if (high < low) [high, low] = [low, high];
        const time = times[i];
        const volume = num(v);
        candles.push({
            ...(time ? { time } : {}),
            open,
            high: Math.max(high, open, close),
            low: Math.min(low, open, close),
            close,
            ...(volume !== undefined && volume >= 0 ? { volume } : {}),
        });
    });
    if (candles.length > 1 && candles.every((c) => c.time)) candles.sort((a, b) => a.time!.getTime() - b.time!.getTime());
    return candles.slice(-POINTS_KEPT);
}

/**
 * Marks a quote whose previous close was worked back from a rounded percentage: good
 * enough for a baseline, not for a figure. A symbol key, so it survives the spread an
 * app's `onChange` makes of the quote it was handed (`{ ...quote, range }`).
 */
const ESTIMATED = Symbol('aparte-stock-estimated');
const isEstimated = (quote: Quote) => (quote as unknown as Record<symbol, unknown>)[ESTIMATED] === true;

/** One quote from whatever a tool wrote, or `null` without a symbol and a price. */
function readQuote(raw: unknown): Quote | null {
    if (!isObject(raw)) return null;
    // Yahoo's chart: the quote is its `meta`, the candles are beside it.
    const r: Raw = isObject(raw['meta']) && isObject(raw['indicators']) ? { ...raw['meta'], candles: raw } : raw;
    const given = str(pick(r, ['symbol', 'ticker', '01. symbol', 'code']));
    if (!given) return null;
    // CoinGecko writes `btc`; a ticker is read in capitals.
    const symbol = /[A-Z]/.test(given) ? given : given.toUpperCase();
    // Finnhub's one-letter fields (`c`, `d`, `pc`…) come last in each list, and are only
    // ever read here, past the symbol: on their own they are no quote at all.
    const sparkline7d = isObject(r['sparkline_in_7d']) ? r['sparkline_in_7d']['price'] : undefined;
    const candles = readCandles(pick(r, ['candles', 'ohlc', 'klines', 'bars']) ?? (isObject(r['chart']) ? r['chart'] : undefined));
    let series = readSeries(pick(r, ['series', 'prices', 'history', 'chart', 'points', 'sparkline']) ?? sparkline7d);
    if (!series.length && candles.length) series = candles.map((c) => (c.time ? { value: c.close, time: c.time } : { value: c.close }));
    const price = num(pick(r, ['price', 'regularMarketPrice', '05. price', 'current_price', 'lastPrice', 'last', 'c'])) ?? series[series.length - 1]?.value;
    if (price === undefined) return null;

    let change = num(pick(r, ['change', 'regularMarketChange', '09. change', 'price_change_24h', 'd']));
    let changePercent = percentOf(pick(r, [
        'changePercent', 'change_percent', 'percentChange', 'percent_change', 'changesPercentage',
        'regularMarketChangePercent', '10. change percent', 'price_change_percentage_24h', 'dp',
    ]));
    let previousClose = num(pick(r, ['previousClose', 'previous_close', 'prevClose', 'regularMarketPreviousClose', '08. previous close', 'pc']));
    // Yahoo's chart names the close before its FIRST point `chartPreviousClose`: yesterday's
    // over a day, the close of a year ago over a year. Read as the previous close past a day,
    // it made the change the year's (+73.23) beside the day's percent (-1.23 %). Past a day
    // there is no day's close in that answer, and none is invented.
    if (previousClose === undefined && str(r['range'])?.toLowerCase() === '1d') previousClose = num(r['chartPreviousClose']);
    // Finnhub answers an unknown symbol with zeros: no price and no close is no quote.
    if (price === 0 && !previousClose) return null;
    if (previousClose === 0) previousClose = undefined;

    let guessed = false;
    if (change === undefined && previousClose !== undefined) change = price - previousClose;
    if (previousClose === undefined && change !== undefined && price - change !== 0) previousClose = price - change;
    if (previousClose === undefined && changePercent !== undefined && changePercent !== -100) {
        previousClose = price / (1 + changePercent / 100);
        guessed = true;
    }
    if (changePercent === undefined && change !== undefined && previousClose) changePercent = (change / previousClose) * 100;

    const range = str(pick(r, ['range', 'period', 'timeframe'])) ?? (sparkline7d && series.length ? '7D' : undefined);
    const positive = (value: unknown) => {
        const n = num(value);
        return n !== undefined && n >= 0 ? n : undefined;
    };
    const fields = {
        name: str(pick(r, ['name', 'shortName', 'longName', 'displayName', 'companyName', 'company_name'])),
        exchange: str(pick(r, ['exchange', 'fullExchangeName', 'exchangeName', 'exchange_name'])),
        currency: currencyCode(pick(r, ['currency', 'currency_code', 'currencyCode', 'financialCurrency'])),
        change,
        changePercent,
        previousClose,
        open: num(pick(r, ['open', 'regularMarketOpen', '02. open', 'o'])),
        high: num(pick(r, ['high', 'dayHigh', 'regularMarketDayHigh', '03. high', 'high_24h', 'h'])),
        low: num(pick(r, ['low', 'dayLow', 'regularMarketDayLow', '04. low', 'low_24h', 'l'])),
        volume: positive(pick(r, ['volume', 'regularMarketVolume', '06. volume', 'total_volume'])),
        marketCap: positive(pick(r, ['marketCap', 'market_cap', 'marketCapitalization', 'MarketCapitalization'])),
        yearHigh: num(pick(r, ['yearHigh', 'fiftyTwoWeekHigh', '52WeekHigh', 'week52High', 'high52', 'year_high'])),
        yearLow: num(pick(r, ['yearLow', 'fiftyTwoWeekLow', '52WeekLow', 'week52Low', 'low52', 'year_low'])),
        range,
        ranges: Array.isArray(r['ranges']) ? [...new Set(r['ranges'].map(str).filter((x): x is string => x !== undefined))].slice(0, 8) : undefined,
        marketState: readMarketState(r),
        time: readTime(pick(r, ['time', 'asOf', 'as_of', 'timestamp', 'updatedAt', 'updated_at', 'lastUpdated', 'last_updated', 'regularMarketTime', '07. latest trading day', 't'])),
        url: webUrl(pick(r, ['url', 'link', 'href'])) ?? undefined,
    };
    const quote: Quote = { symbol, price, series, candles };
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && !(Array.isArray(value) && value.length === 0)) (quote as unknown as Raw)[key] = value;
    }
    // A 52-week range the wrong way round, or flat, is no range.
    if (quote.yearHigh === undefined || quote.yearLow === undefined || quote.yearHigh <= quote.yearLow) {
        delete quote.yearHigh;
        delete quote.yearLow;
    }
    if (guessed || (r as Record<symbol, unknown>)[ESTIMATED] === true) (quote as unknown as Record<symbol, unknown>)[ESTIMATED] = true;
    return quote;
}

/**
 * The card's data from the loose shape `map` returns — one quote, a list, or
 * `{ title, quotes }` (also `results`, `items`, `data`, Yahoo's `quoteResponse.result`,
 * Alpha Vantage's `Global Quote`) — or `null` when not one quote has a symbol and a price.
 * At most twelve are kept.
 */
export function readQuotes(raw: unknown): StockData | null {
    if (!raw || typeof raw !== 'object') return null;
    let list: unknown[];
    let title: string | undefined;
    if (Array.isArray(raw)) {
        list = raw;
    } else {
        const r = raw as Raw;
        const single = readQuote(r);
        if (single) return { quotes: [single] };
        const yahoo = isObject(r['quoteResponse']) ? r['quoteResponse']['result'] : undefined;
        const yahooChart = isObject(r['chart']) ? r['chart']['result'] : undefined;
        const many = [r['quotes'], r['results'], r['items'], r['watchlist'], r['data'], yahoo, yahooChart].find(Array.isArray);
        if (many) {
            list = many;
            title = str(pick(r, ['title', 'heading', 'name']));
        } else {
            list = [r['Global Quote']];
        }
    }
    const quotes = list.map(readQuote).filter((q): q is Quote => q !== null).slice(0, QUOTES_SHOWN);
    return quotes.length ? { ...(title ? { title } : {}), quotes } : null;
}

/** Which way a quote moved; `undefined` when the tool said nothing of it. */
export function directionOf(quote: Pick<Quote, 'change' | 'changePercent'>): 'up' | 'down' | 'flat' | undefined {
    const moved = quote.change ?? quote.changePercent;
    if (moved === undefined) return undefined;
    return moved > 0 ? 'up' : moved < 0 ? 'down' : 'flat';
}

/**
 * What the chart is split at. The previous close, for a day's chart (a range of one day,
 * or none said): that is what the day's change is measured against. For a longer range,
 * where the series started — yesterday's close in the middle of a year is a line nothing
 * on the chart relates to.
 */
export function baselineOf(quote: Quote): { value: number; kind: 'close' | 'start' } | undefined {
    const intraday = !quote.range || /^(1\s*d(ay)?|today|intraday)$/i.test(quote.range.trim());
    if (intraday && quote.previousClose !== undefined) return { value: quote.previousClose, kind: 'close' };
    const first = quote.series[0];
    return first ? { value: first.value, kind: 'start' } : undefined;
}

// ── Formatting ───────────────────────────────────────────────────────────────

const minorCache = new Map<string, number>();

/** The currency's own decimals: 2 for the dollar, 0 for the yen. */
function minorDigits(currency?: string): number {
    if (!currency) return 2;
    let digits = minorCache.get(currency);
    if (digits === undefined) {
        try {
            digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
        } catch {
            digits = 2;
        }
        minorCache.set(currency, digits);
    }
    return digits;
}

function decimalsOf(n: number): number {
    const [mantissa, exponent] = String(Math.abs(n)).split('e');
    const decimals = (mantissa!.split('.')[1] ?? '').length;
    return Math.max(0, decimals - Number(exponent ?? 0));
}

/**
 * How many decimals a quote's prices are written with. The currency's own (2, 0 for the
 * yen) at least; more where the price needs them — a currency pair is read to four
 * (`1.0832`), a coin under one to four significant digits (`0.00001234`). A float's noise
 * (`182.52999877929688`) is not precision: past four decimals the price is rounded.
 */
export function digitsOf(quote: Pick<Quote, 'price' | 'currency'>): number {
    const base = minorDigits(quote.currency);
    const abs = Math.abs(quote.price);
    const given = decimalsOf(quote.price);
    if (abs > 0 && abs < 1) return Math.min(Math.max(base, given), Math.floor(-Math.log10(abs)) + 4, 8);
    if (abs >= 10) return Math.max(base, Math.min(given, 2));
    if (given <= base) return base;
    return Math.min(given, 4);
}

/** A price in the quote's precision, without its currency: the big number, the figures. */
function plain(config: AparteConfig, quote: Quote, value: number): string {
    const d = digitsOf(quote);
    return formatNumber(config, value, { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** A price with its currency's symbol, for a row or a tick: `$182.52`, `€45.13`. */
function money(config: AparteConfig, quote: Quote, value: number): string {
    if (!quote.currency) return plain(config, quote, value);
    const d = digitsOf(quote);
    try {
        return formatNumber(config, value, { style: 'currency', currency: quote.currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: d, maximumFractionDigits: d });
    } catch {
        return `${plain(config, quote, value)} ${quote.currency}`;
    }
}

/** `+0.68%`, with its sign whichever way it went. */
function percentText(config: AparteConfig, percent: number): string {
    return formatNumber(config, percent / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
}

function changeText(config: AparteConfig, quote: Quote, short: boolean): string {
    const absolute = quote.change !== undefined
        ? formatNumber(config, quote.change, { minimumFractionDigits: digitsOf(quote), maximumFractionDigits: digitsOf(quote), signDisplay: 'exceptZero' })
        : undefined;
    const percent = quote.changePercent !== undefined ? percentText(config, quote.changePercent) : undefined;
    if (short) return (percent ?? absolute)!;
    return absolute && percent ? `${absolute} (${percent})` : (absolute ?? percent)!;
}

/** Large numbers the way a market page writes them: `52.3M`, `2.85 Bio. $`. */
function compact(config: AparteConfig, value: number, currency?: string): string {
    const options: Intl.NumberFormatOptions = { notation: 'compact', maximumFractionDigits: 2 };
    if (currency) {
        try {
            return formatNumber(config, value, { ...options, style: 'currency', currency, currencyDisplay: 'narrowSymbol' });
        } catch {
            // A currency `Intl` does not know: the number alone.
        }
    }
    return formatNumber(config, value, options);
}

const UNITS: Record<string, string> = { d: 'day', w: 'week', m: 'month', y: 'year' };

/** `1D` → "1 day", `6M` → "6 months", in the chat's language; a label of the tool's own as it wrote it. */
function rangeText(config: AparteConfig, range: string): string {
    const match = /^(\d+)\s*(d|days?|w|wks?|weeks?|m|mo|mos|mons?|months?|y|yrs?|years?)$/i.exec(range.trim());
    if (!match) return range;
    try {
        return formatNumber(config, Number(match[1]), { style: 'unit', unit: UNITS[match[2]!.charAt(0).toLowerCase()]!, unitDisplay: 'long' });
    } catch {
        return range;
    }
}

/**
 * A range on its button: the language's narrow unit (`5d`, `1 mese`, `1年`), and a one- or
 * two-letter abbreviation tightened into capitals the way a market's own buttons write it
 * (`5D`, `1M`, `5J`, `1Г`). The full words are the button's accessible name.
 */
function rangeShort(config: AparteConfig, range: string): string {
    const match = /^(\d+)\s*(d|days?|w|wks?|weeks?|m|mo|mos|mons?|months?|y|yrs?|years?)$/i.exec(range.trim());
    if (!match) return range;
    let text: string;
    try {
        text = formatNumber(config, Number(match[1]), { style: 'unit', unit: UNITS[match[2]!.charAt(0).toLowerCase()]!, unitDisplay: 'narrow' }).replace(/\.$/, '');
    } catch {
        return range;
    }
    return /^\d+\s?\p{L}{1,2}$/u.test(text) ? text.replace(/\s/g, '').toLocaleUpperCase(intlTag(config)) : text;
}

/** "As of" time: the hour today, the day for a close written as a date, the day and hour otherwise. */
function whenText(config: AparteConfig, date: Date, now = new Date()): string {
    const tag = intlTag(config);
    const dayOnly = !date.getHours() && !date.getMinutes() && !date.getSeconds();
    const sameYear = date.getFullYear() === now.getFullYear();
    if (dayOnly) return new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' }).format(date);
    if (date.toDateString() === now.toDateString()) return formatHour(config, date);
    return new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

/** A point's time under the cursor, as fine as the series is long. */
function pointTime(config: AparteConfig, date: Date, span: number): string {
    const tag = intlTag(config);
    if (span <= 36 * 3_600_000) return formatHour(config, date);
    if (span <= 8 * 86_400_000) return formatWhen(config, date);
    if (span <= 400 * 86_400_000) return new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric' }).format(date);
    return new Intl.DateTimeFormat(tag, { month: 'short', year: 'numeric' }).format(date);
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const notNull = <T>(value: T | null | undefined | false): value is T => value !== null && value !== undefined && value !== false;

/** The symbol, a link out when the quote has a URL. */
function symbolOf(quote: Quote, stretched = false): HTMLElement {
    if (!quote.url) return el('span', { class: 'aparte-stock__symbol', text: quote.symbol });
    return el('a', {
        class: `aparte-stock__symbol aparte-stock__link${stretched ? ' aparte-stock__link--stretched' : ''}`,
        attrs: { href: quote.url, target: '_blank', rel: 'noopener noreferrer' },
        text: quote.symbol,
    });
}

/** The change: an arrow and a signed number, in the change's colour — the sign says it without the colour. */
function changePill(ctx: CardContext, quote: Quote, short = false): HTMLElement | null {
    const direction = directionOf(quote);
    if (!direction) return null;
    const pill = el('span', { class: 'aparte-stock__change', attrs: { 'data-direction': direction } });
    if (direction !== 'flat') pill.append(glyph(direction === 'up' ? UP : DOWN, 'aparte-rich-card__glyph aparte-stock__arrow'));
    const text = el('span', { class: 'aparte-stock__change-text' });
    ctx.bind(text, () => changeText(ctx.config, quote, short));
    pill.append(text);
    return pill;
}

function marketOf(ctx: CardContext, quote: Quote): HTMLElement | null {
    if (!quote.marketState) return null;
    const text = el('span', { class: 'aparte-stock__market-text' });
    ctx.word(text, MARKET_WORD[quote.marketState], S[MARKET_WORD[quote.marketState]]);
    return el('span', { class: 'aparte-stock__market', attrs: { 'data-market': quote.marketState } },
        el('span', { class: 'aparte-stock__market-dot', attrs: { 'aria-hidden': 'true' } }),
        text);
}

function asOf(ctx: CardContext, quote: Quote): HTMLElement | null {
    if (!quote.time) return null;
    const time = quote.time;
    const node = el('time', { class: 'aparte-stock__time', attrs: { datetime: time.toISOString() } });
    ctx.bind(node, () => word(ctx.config, 'cardsStockAsOf', S.cardsStockAsOf, { time: whenText(ctx.config, time) }));
    return node;
}

function head(ctx: CardContext, quote: Quote): HTMLElement {
    const meta = [
        quote.exchange ? el('span', { class: 'aparte-stock__exchange', text: quote.exchange }) : null,
        marketOf(ctx, quote),
        asOf(ctx, quote),
    ].filter(notNull);
    return el('div', { class: 'aparte-stock__head' },
        el('div', { class: 'aparte-stock__id' },
            symbolOf(quote),
            quote.name ? el('span', { class: 'aparte-stock__name', text: quote.name }) : null),
        meta.length ? el('div', { class: 'aparte-stock__meta' }, ...meta) : null);
}

function chartLabel(ctx: CardContext, quote: Quote, low: number, high: number, last: number): string {
    const vars = {
        low: plain(ctx.config, quote, low),
        high: plain(ctx.config, quote, high),
        last: plain(ctx.config, quote, last),
        range: quote.range ? rangeText(ctx.config, quote.range) : '',
    };
    return quote.range ? word(ctx.config, 'cardsStockChartRange', S.cardsStockChartRange, vars) : word(ctx.config, 'cardsStockChart', S.cardsStockChart, vars);
}

/** How long the points cover, for how finely their times are written. */
function spanOf(times: Array<Date | undefined>): number {
    const known = times.filter(notNull);
    return known.length > 1 ? known[known.length - 1]!.getTime() - known[0]!.getTime() : 0;
}

/** The range under the chart, unless the buttons over it already say which is pressed. */
function rangeChip(ctx: CardContext, quote: Quote): HTMLElement | null {
    if (!quote.range || (ctx.live && quote.ranges?.length)) return null;
    const range = el('span', { class: 'aparte-stock__range' });
    const value = quote.range;
    ctx.bind(range, () => rangeText(ctx.config, value));
    return range;
}

/** The candlestick chart, with its range under it. */
function candlesOf(ctx: CardContext, quote: Quote): HTMLElement | null {
    const { candles } = quote;
    const value = (v: number) => plain(ctx.config, quote, v);
    const span = spanOf(candles.map((c) => c.time));
    const low = Math.min(...candles.map((c) => c.low));
    const high = Math.max(...candles.map((c) => c.high));
    return candleChart(ctx, {
        candles,
        value,
        time: (d) => pointTime(ctx.config, d, span),
        ohlc: (c) => {
            const vars = { open: value(c.open), high: value(c.high), low: value(c.low), close: value(c.close) };
            return { shown: word(ctx.config, 'cardsStockOhlc', S.cardsStockOhlc, vars), spoken: word(ctx.config, 'cardsStockOhlcSaid', S.cardsStockOhlcSaid, vars) };
        },
        label: () => chartLabel(ctx, quote, low, high, candles[candles.length - 1]!.close),
        info: [rangeChip(ctx, quote)].filter(notNull),
    });
}

/** The chart, with its range and its baseline's legend under it — or, past a day, the range's own change. */
function chartOf(ctx: CardContext, quote: Quote): HTMLElement | null {
    // Candles when they were asked for and given; the line otherwise, from the series or the closes.
    if (ctx.variant === 'candles' && quote.candles.length) return candlesOf(ctx, quote);
    const base = baselineOf(quote);
    if (!base || quote.series.length < 2) return null;
    const info: Node[] = [];
    const chip = rangeChip(ctx, quote);
    if (chip) info.push(chip);
    if (base.kind === 'close') {
        const text = el('span', { class: 'aparte-stock__legend-text' });
        ctx.bind(text, () => `${word(ctx.config, 'cardsStockPrevClose', S.cardsStockPrevClose)} ${plain(ctx.config, quote, base.value)}`);
        info.push(el('span', { class: 'aparte-stock__legend' }, el('span', { class: 'aparte-stock__legend-line', attrs: { 'aria-hidden': 'true' } }), text));
    } else if (base.value !== 0) {
        const last = quote.series[quote.series.length - 1]!.value;
        const moved = ((last - base.value) / Math.abs(base.value)) * 100;
        const over = changePill(ctx, { ...quote, change: undefined, changePercent: moved }, true);
        if (over) {
            over.classList.add('aparte-stock__change--range');
            info.push(over);
        }
    }
    const span = spanOf(quote.series.map((p) => p.time));
    const values = quote.series.map((p) => p.value);
    return priceChart(ctx, {
        points: quote.series,
        baseline: base.value,
        value: (v) => plain(ctx.config, quote, v),
        time: (d) => pointTime(ctx.config, d, span),
        label: () => chartLabel(ctx, quote, Math.min(...values), Math.max(...values), values[values.length - 1]!),
        live: quote.marketState === 'open',
        info,
    });
}

/** The day's figures, then the 52-week range as a bar with the price on it. */
function stats(ctx: CardContext, quote: Quote): HTMLElement | null {
    const list = el('dl', { class: 'aparte-stock__stats' });
    const stat = (key: keyof typeof S, compute: () => string, extra?: HTMLElement) => {
        const term = el('dt', { class: 'aparte-stock__stat-term' });
        ctx.word(term, key, S[key]);
        const value = el('dd', { class: 'aparte-stock__stat-value' });
        if (extra) value.append(extra);
        else ctx.bind(value, compute);
        list.append(el('div', { class: `aparte-stock__stat${extra ? ' aparte-stock__stat--wide' : ''}` }, term, value));
    };
    const figure = (value: number | undefined) => (value === undefined ? undefined : () => plain(ctx.config, quote, value));
    const rows: Array<[keyof typeof S, (() => string) | undefined]> = [
        ['cardsStockOpen', figure(quote.open)],
        ['cardsStockHigh', figure(quote.high)],
        ['cardsStockLow', figure(quote.low)],
        ['cardsStockPrevClose', isEstimated(quote) ? undefined : figure(quote.previousClose)],
        ['cardsStockVolume', quote.volume === undefined ? undefined : () => compact(ctx.config, quote.volume!)],
        ['cardsStockMarketCap', quote.marketCap === undefined ? undefined : () => compact(ctx.config, quote.marketCap!, quote.currency)],
    ];
    for (const [key, compute] of rows) if (compute) stat(key, compute);
    if (quote.yearLow !== undefined && quote.yearHigh !== undefined) {
        const { yearLow: low, yearHigh: high } = quote;
        const position = Math.max(0, Math.min(1, (quote.price - low) / (high - low)));
        const bar = el('span', { class: 'aparte-stock__year-bar', attrs: { 'aria-hidden': 'true' } },
            el('span', { class: 'aparte-stock__year-mark' }));
        bar.style.setProperty('--aparte-stock-position', `${(position * 100).toFixed(1)}%`);
        const lowText = el('span', { class: 'aparte-stock__year-low' });
        ctx.bind(lowText, () => plain(ctx.config, quote, low));
        const highText = el('span', { class: 'aparte-stock__year-high' });
        ctx.bind(highText, () => plain(ctx.config, quote, high));
        // The two ends are text; the bar between them only places the price, which is written above.
        stat('cardsStockYearRange', () => '', el('span', { class: 'aparte-stock__year' }, lowText, bar, highText));
    }
    return list.childNodes.length ? list : null;
}

/**
 * The range buttons, when the app serves ranges (`ctx.live` and `quote.ranges`). They sit
 * over the chart, across its width: they change the chart, so they are on its edge — where
 * a market's own app puts them — and stretched, every range is a fair target for a thumb
 * and the row reads as the chart's own tabs. Over it rather than under it, because the
 * line under the plot is the readout's while the chart is explored. They are drawn even
 * when the new range came back without a chart, so another can be chosen.
 */
function rangesOf(ctx: CardContext, quote: Quote): HTMLElement | null {
    const ranges = quote.ranges ?? [];
    const pressed = ranges.find((r) => r.toLowerCase() === quote.range?.toLowerCase()) ?? quote.range;
    const group = segmented(ctx, {
        name: 'range',
        value: pressed,
        options: ranges.map((r) => ({ value: r, label: () => rangeShort(ctx.config, r) })),
        label: () => word(ctx.config, 'cardsStockRange', S.cardsStockRange),
    });
    if (!group) return null;
    // "1M" on the button, "1 month" to a screen reader.
    group.querySelectorAll('button').forEach((button, i) => ctx.bind(button, () => rangeText(ctx.config, ranges[i]!), 'aria-label'));
    return el('div', { class: 'aparte-stock__ranges' }, group);
}

/** The `chart` and `candles` variants: one quote at length. */
function chartCard(ctx: CardContext, quote: Quote): HTMLElement {
    const price = el('span', { class: 'aparte-stock__price' });
    ctx.bind(price, () => plain(ctx.config, quote, quote.price));
    const amount = el('span', { class: 'aparte-stock__amount' },
        price,
        quote.currency ? el('span', { class: 'aparte-stock__currency', text: quote.currency }) : null);
    return el('div', { class: 'aparte-stock aparte-stock--chart', attrs: { 'data-direction': directionOf(quote) } },
        head(ctx, quote),
        el('div', { class: 'aparte-stock__quote' }, amount, changePill(ctx, quote)),
        rangesOf(ctx, quote),
        chartOf(ctx, quote),
        stats(ctx, quote));
}

/** A sparkline in the change's colour, over the dashed baseline the chart would use. */
function sparkOf(quote: Quote): SVGSVGElement | null {
    const base = baselineOf(quote);
    if (!base || quote.series.length < 2) return null;
    const values = thin(quote.series, 64).map((p) => p.value);
    const lo = Math.min(...values, base.value);
    const hi = Math.max(...values, base.value);
    const pad = 0.12;
    const svg = sparkline(values, { className: 'aparte-stock__sparkline', range: [lo, hi], pad });
    // The kit draws in a 100 × 40 box; the baseline is placed by the same rule.
    const y = hi === lo ? 20 : 40 - (pad * 40 + ((base.value - lo) / (hi - lo)) * (40 - 2 * pad * 40));
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    for (const [name, value] of Object.entries({ x1: 0, x2: 100, y1: y.toFixed(2), y2: y.toFixed(2), 'vector-effect': 'non-scaling-stroke' })) line.setAttribute(name, String(value));
    line.setAttribute('class', 'aparte-stock__spark-base');
    svg.prepend(line);
    return svg;
}

/** The `compact` variant's row: symbol and name, sparkline, price and change. */
function row(ctx: CardContext, quote: Quote): HTMLElement {
    const price = el('span', { class: 'aparte-stock__row-price' });
    ctx.bind(price, () => money(ctx.config, quote, quote.price));
    const spark = sparkOf(quote);
    return el('div', { class: 'aparte-stock aparte-stock--row', attrs: { 'data-direction': directionOf(quote), 'data-linked': quote.url !== undefined } },
        el('div', { class: 'aparte-stock__id' },
            symbolOf(quote, true),
            quote.name ? el('span', { class: 'aparte-stock__name', text: quote.name }) : null),
        el('div', { class: 'aparte-stock__spark', attrs: { 'data-empty': !spark } }, spark),
        el('div', { class: 'aparte-stock__figures' }, price, changePill(ctx, quote, true)));
}

/** The `ticker` variant: a strip of symbol, price and change, scrolled by hand. */
function ticker(ctx: CardContext, data: StockData): HTMLElement {
    const tape = el('ul', { class: 'aparte-stock__tape', attrs: { role: 'list', tabindex: 0 } });
    ctx.bind(tape, () => labelOf(data, ctx), 'aria-label');
    for (const quote of data.quotes) {
        const price = el('span', { class: 'aparte-stock__tick-price' });
        ctx.bind(price, () => money(ctx.config, quote, quote.price));
        tape.append(el('li', { class: 'aparte-stock__tick', attrs: { 'data-direction': directionOf(quote), 'data-linked': quote.url !== undefined } },
            symbolOf(quote, true), price, changePill(ctx, quote, true)));
    }
    return el('div', { class: 'aparte-stock__ticker' }, tape);
}

function heading(data: StockData): HTMLElement | null {
    return data.title ? el('div', { class: 'aparte-stock__heading', text: data.title }) : null;
}

function labelOf(data: Partial<StockData> | null, ctx: CardContext): string {
    const quotes = data?.quotes ?? [];
    if (quotes.length === 1) return quotes[0]!.name ? `${quotes[0]!.symbol} ${quotes[0]!.name}` : quotes[0]!.symbol;
    if (data?.title) return data.title;
    if (quotes.length > 1) return word(ctx.config, 'cardsStockCount', S.cardsStockCount, { n: formatNumber(ctx.config, quotes.length) });
    return word(ctx.config, 'cardsStockTitle', S.cardsStockTitle);
}

function render(data: StockData, ctx: CardContext<StockVariant>): Node[] {
    const { quotes } = data;
    if (ctx.variant === 'ticker') return [heading(data), ticker(ctx, data)].filter(notNull);
    if (quotes.length === 1) return [ctx.variant === 'compact' ? row(ctx, quotes[0]!) : chartCard(ctx, quotes[0]!)];
    const list = el('ul', { class: 'aparte-stock__list', attrs: { role: 'list' } },
        ...quotes.map((q) => el('li', { class: 'aparte-stock__item' }, row(ctx, q))));
    return [heading(data), list].filter(notNull);
}

function skeleton(partial: Partial<StockData> | null, ctx: CardContext<StockVariant>): Node[] {
    const block = (cls: string, kind: 'text' | 'rect' = 'text') =>
        el('span', { class: `aparte-skeleton aparte-skeleton--${kind} ${cls}`, attrs: { 'aria-hidden': 'true' } });
    // The symbols the call asked for, before their prices are in.
    const symbols = partial?.title ? partial.title.split(/,\s*/).filter(Boolean) : [];
    const symbol = (text?: string) => (text ? el('span', { class: 'aparte-stock__symbol', text }) : block('aparte-stock__sk-symbol'));

    if (ctx.variant === 'ticker') {
        const ticks = Array.from({ length: Math.max(4, symbols.length) }, (_, i) =>
            el('li', { class: 'aparte-stock__tick aparte-stock__tick--skeleton' }, symbol(symbols[i]), block('aparte-stock__sk-figure')));
        return [el('div', { class: 'aparte-stock__ticker' }, el('ul', { class: 'aparte-stock__tape', attrs: { role: 'list' } }, ...ticks))];
    }
    if (ctx.variant === 'compact' || symbols.length > 1) {
        const rows = Array.from({ length: Math.max(3, Math.min(symbols.length, QUOTES_SHOWN)) }, (_, i) =>
            el('li', { class: 'aparte-stock__item' },
                el('div', { class: 'aparte-stock aparte-stock--row aparte-stock--skeleton' },
                    el('div', { class: 'aparte-stock__id' }, symbol(symbols[i]), block('aparte-stock__sk-name')),
                    block('aparte-stock__spark aparte-stock__sk-spark', 'rect'),
                    el('div', { class: 'aparte-stock__figures' }, block('aparte-stock__sk-figure'), block('aparte-stock__sk-pill')))));
        return [el('ul', { class: 'aparte-stock__list', attrs: { role: 'list' } }, ...rows)];
    }
    return [el('div', { class: 'aparte-stock aparte-stock--chart aparte-stock--skeleton' },
        el('div', { class: 'aparte-stock__head' }, el('div', { class: 'aparte-stock__id' }, symbol(symbols[0]), block('aparte-stock__sk-name'))),
        el('div', { class: 'aparte-stock__quote' }, block('aparte-stock__sk-price'), block('aparte-stock__sk-pill')),
        block('aparte-stock__sk-chart', 'rect'),
        el('div', { class: 'aparte-stock__stats' }, ...Array.from({ length: 6 }, () => el('div', { class: 'aparte-stock__stat' }, block('aparte-stock__sk-term'), block('aparte-stock__sk-figure')))))];
}

export const stockCard = defineCard<StockData, StockVariant>({
    name: 'stock',
    variants: ['chart', 'compact', 'ticker', 'candles'],
    styles: stockStyles,
    icon: CHART,
    normalize: readQuotes,
    render,
    skeleton,
    label: labelOf,
    fallback: (data, ctx) => {
        // "AAPL 182.52 USD, +1.23 (+0.68%)": a line per quote, as a model would list them.
        const lines = data.quotes.map((q) => {
            const price = `${plain(ctx.config, q, q.price)}${q.currency ? ` ${q.currency}` : ''}`;
            return directionOf(q) ? `${q.symbol} ${price}, ${changeText(ctx.config, q, false)}` : `${q.symbol} ${price}`;
        });
        return [data.quotes.length > 1 ? data.title : undefined, ...lines].filter(notNull).join('\n');
    },
    partial: (input) => {
        const raw = input['symbols'] ?? input['tickers'] ?? input['symbol'] ?? input['ticker'] ?? input['pair'];
        const list = (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [])
            .map((s) => str(s))
            .filter((s): s is string => s !== undefined)
            .map((s) => (/[A-Z]/.test(s) ? s : s.toUpperCase()));
        return list.length ? { title: list.slice(0, QUOTES_SHOWN).join(', ') } : null;
    },
});

/** Draw a tool's quotes as this card — returns the function that stops it. */
export function setupStockCard(options: CardSetupOptions<StockData, StockVariant> = {}): () => void {
    return stockCard.setup(options);
}
