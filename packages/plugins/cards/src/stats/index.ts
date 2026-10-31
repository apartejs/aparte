/**
 * @aparte/plugin-cards/stats — a tool's key figures, drawn as a card.
 *
 *   import { setupStatsCard } from '@aparte/plugin-cards/stats';
 *
 *   setupStatsCard({
 *     tool: 'get_sales_summary',
 *     map: (result) => ({ title: 'Sales this week', items: result.kpis }),
 *   });
 *
 * Three variants of one card: `tiles` (a grid of KPI tiles — label, big number, the change
 * as a pill, a sparkline under it), `list` (a fact sheet: one row per figure, the value
 * at the end, for five to twelve facts) and `hero` (the first figure large over a wide
 * chart, the others as a row of small ones beneath).
 *
 * Your tool keeps its own fields: `readStats` reads a list of figures, one figure, a
 * `{ title, items }` envelope, or a plain record — `{ Revenue: 12000, Orders: 340 }` — as
 * label → value pairs; and the usual spellings of each field (`name` for `label`, `amount`
 * or `count` for `value`, `delta` for `change`, `history` for `trend`). `map` covers the rest.
 * A record's `currency` and `unit` are how its figures are written, never figures: the
 * currency goes to the keys that name money (`revenue`, `avgOrderValue`, `mrr` — not
 * `orders`, nor `refundRate`), the unit to the others, and a figure's own always wins.
 *
 * **How a change is read.** A change is a percentage unless `changeFormat: 'absolute'`
 * says it is in the figure's own unit. A percentage given as a number follows one rule:
 * at most 1 in size it is a ratio (`0.12` → +12 %), above that it is already in percent
 * (`12` → +12 %). So `1` is +100 %; write `"1%"` — a string with its sign is never
 * ambiguous — or use `changePercent`, which is always in percent, for one per cent.
 * A `percent` figure's value follows the same rule.
 */
import type { AparteConfig } from '@aparte/core';
import { defineCard, type CardContext, type CardSetupOptions } from '../kit/define.js';
import { el, glyph, num, str } from '../kit/dom.js';
import { currencyCode, formatNumber, formatUnit, formatWhen, toDate } from '../kit/format.js';
import { sparkline } from '../kit/sparkline.js';
import { intlTag, word, type CardWord } from '../kit/strings.js';
import { BARS, STAT_ICONS } from './icons.js';
import statsStyles from './stats.css?raw';

export type StatsVariant = 'tiles' | 'list' | 'hero';

/** How a figure's value is written. */
export type StatFormat = 'number' | 'percent' | 'currency' | 'compact' | 'duration' | 'text';

/** The glyphs a figure may wear beside its label. */
export type StatIcon = keyof typeof STAT_ICONS;

/**
 * One figure as `map` returns it. Only `label` and `value` are needed; every other field
 * adds a line when it is there and nothing when it is not.
 */
export interface StatInput {
    label: string;
    /** A number, or a short text (`"Gold"`, `"4.8/5"`). `"12%"` is read as a percentage. */
    value: number | string;
    /**
     * `number` (the default), `percent` (see the rule above), `currency` (with `currency`),
     * `compact` (`12K`, `1.2M`), `duration` (seconds → `1 hr 20 min`) or `text`.
     */
    format?: StatFormat;
    /** An ISO 4217 code (`EUR`) or a usual symbol (`€`); alone, it makes the figure a sum. */
    currency?: string;
    /** An `Intl` unit (`kilometer`, `megabyte`, `kilometer-per-hour`), or any text, appended. */
    unit?: string;
    /** Decimals shown, 0–6. */
    digits?: number;
    /** The change: a percentage (the rule above) or, with `changeFormat: 'absolute'`, in the figure's unit. */
    change?: number | string;
    changeFormat?: 'percent' | 'absolute';
    /** What the change compares with: "vs last week". */
    changeLabel?: string;
    /** Which way is good — it colours the change green or red, and says which to a screen reader. Without it the change is neutral. */
    good?: 'up' | 'down';
    /** Past values, oldest first, for the sparkline. */
    trend?: number[];
    /** One short line under the figure. */
    hint?: string;
    icon?: StatIcon;
}

/** What `map` returns: figures with a heading, a list of them, one figure, or a record of label → value. */
export type StatsInput =
    | { title?: string; subtitle?: string; items: StatInput[]; footnote?: string; updatedAt?: string | number | Date }
    | StatInput[]
    | StatInput
    | Record<string, number | string>;

/** One figure as the card draws it, once read. */
export interface Stat {
    label: string;
    /** A number in the scale it is drawn in (a `percent` figure's is a ratio), or — for `text` — a text drawn as given. */
    value: number | string;
    /** `text` exactly when `value` is a string; never `currency` without a currency. */
    format: StatFormat;
    /** An ISO 4217 code. */
    currency?: string;
    unit?: string;
    digits?: number;
    /** A ratio for a `percent` change; in the value's own scale for an `absolute` one. */
    change?: number;
    changeFormat: 'percent' | 'absolute';
    changeLabel?: string;
    good?: 'up' | 'down';
    /** Two points at least, finite. */
    trend?: number[];
    hint?: string;
    icon?: StatIcon;
}

/** The data as the card draws it. */
export interface StatsData {
    title?: string;
    subtitle?: string;
    items: Stat[];
    footnote?: string;
    updatedAt?: Date;
}

const S = {
    cardsStatsTitle: { en: 'Key figures', fr: 'Chiffres clés', de: 'Kennzahlen', es: 'Cifras clave', it: 'Dati chiave', ja: '主要な数値', ko: '주요 수치', pt: 'Números-chave', ru: 'Ключевые показатели', zh: '关键数据' },
    cardsStatsCount: { en: '{n} figures', fr: '{n} chiffres', de: '{n} Kennzahlen', es: '{n} cifras', it: '{n} dati', ja: '{n}件の数値', ko: '수치 {n}개', pt: '{n} números', ru: 'Показателей: {n}', zh: '{n} 项数据' },
    cardsStatsUpdated: { en: 'Updated {when}', fr: 'Mis à jour {when}', de: 'Aktualisiert {when}', es: 'Actualizado {when}', it: 'Aggiornato {when}', ja: '{when} 更新', ko: '{when} 업데이트', pt: 'Atualizado {when}', ru: 'Обновлено {when}', zh: '更新于 {when}' },
    // Said after the change ("+12% good"): the pill's green or red, for a reader who does not see colour.
    cardsStatsGood: { en: 'good', fr: 'favorable', de: 'positiv', es: 'favorable', it: 'positivo', ja: '好調', ko: '좋음', pt: 'favorável', ru: 'хорошо', zh: '向好' },
    cardsStatsBad: { en: 'bad', fr: 'défavorable', de: 'negativ', es: 'desfavorable', it: 'negativo', ja: '不調', ko: '나쁨', pt: 'desfavorável', ru: 'плохо', zh: '变差' },
} satisfies Record<string, CardWord>;

/** Twelve: past that a card of figures is a report, not an answer. */
const STATS_SHOWN = 12;
/** Points kept in a trend: past this a sparkline is a smudge. */
const TREND_POINTS = 60;

const FORMATS: readonly StatFormat[] = ['number', 'percent', 'currency', 'compact', 'duration', 'text'];

// ── Reading ──────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);

/** The first of `keys` that `r` has a value for. */
function pick(r: Raw, keys: readonly string[]): unknown {
    for (const key of keys) if (r[key] !== undefined && r[key] !== null && r[key] !== '') return r[key];
    return undefined;
}

const LABEL_KEYS = ['label', 'name', 'title', 'key', 'metric'] as const;
const VALUE_KEYS = ['value', 'amount', 'count', 'total'] as const;
const LIST_KEYS = ['items', 'stats', 'metrics', 'kpis', 'figures', 'facts'] as const;

/** A number written with its sign and per cent: `"+12%"`, `"−3,5 %"`, `"12%"`. */
const PERCENT_TEXT = /^([+\-−]?)\s*(\d+(?:[.,]\d+)?)\s*%$/;
/** A number grouped by commas, as an English tool writes it: `"12,000"`, `"1,234.5"`. */
const GROUPED = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

/** A number from a value: a finite number, `"12"`, or `"12,000"`. */
function amount(value: unknown): number | undefined {
    const n = num(value);
    if (n !== undefined) return n;
    if (typeof value === 'string' && GROUPED.test(value.trim())) return Number(value.trim().replace(/,/g, ''));
    return undefined;
}

/** A percentage written as text, as a ratio: `"+12%"` → 0.12. */
function percentText(value: unknown): number | undefined {
    if (typeof value !== 'string') return undefined;
    const match = PERCENT_TEXT.exec(value.trim());
    if (!match) return undefined;
    const n = Number(match[2]!.replace(',', '.')) / 100;
    return match[1] === '-' || match[1] === '−' ? -n : n;
}

/** The ratio rule: at most 1 in size it is a ratio, above that it is in percent. */
const asRatio = (n: number) => (Math.abs(n) <= 1 ? n : n / 100);

/** An `Intl` unit name the runtime knows (`kilometer`, `kilometer-per-hour`). */
function isIntlUnit(unit: string): boolean {
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(unit)) return false;
    try {
        new Intl.NumberFormat('en', { style: 'unit', unit });
        return true;
    } catch {
        return false;
    }
}

/** `up`/`down` from what a tool writes: `higher`, `lower`, `increase`… */
function readGood(r: Raw): Stat['good'] {
    const value = pick(r, ['good', 'better', 'goodDirection', 'good_direction']);
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (['up', 'higher', 'increase', 'high', 'more'].includes(v)) return 'up';
        if (['down', 'lower', 'decrease', 'low', 'less'].includes(v)) return 'down';
    }
    const lower = pick(r, ['lowerIsBetter', 'lower_is_better', 'invert', 'inverted']);
    if (typeof lower === 'boolean') return lower ? 'down' : 'up';
    const higher = pick(r, ['higherIsBetter', 'higher_is_better']);
    if (typeof higher === 'boolean') return higher ? 'up' : 'down';
    return undefined;
}

/** The trend's points, from numbers, `{ value }` points or `[x, y]` pairs. */
function readTrend(value: unknown): number[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const points = value
        .map((p) => (Array.isArray(p) ? num(p[1]) : isObject(p) ? num(pick(p, ['value', 'y', 'v', 'count', 'amount'])) : num(p)))
        .filter((n): n is number => n !== undefined)
        .slice(-TREND_POINTS);
    return points.length >= 2 ? points : undefined;
}

/**
 * `key` as a label when a record gave it: `conversionRate` → "Conversion rate",
 * `avg_order_value` → "Avg order value". A key already written for people — with a space,
 * or a single word in capitals like `MRR` — is kept as it is.
 */
export function humanizeKey(key: string): string {
    const k = key.trim();
    if (/\s/.test(k) || !/[a-z]/.test(k)) return k;
    const words = k.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[\s_-]+/).filter(Boolean);
    const text = words.map((w) => (/^[A-Z\d]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One figure from whatever a tool wrote, or `null` without a label and a value to show. */
function readStat(raw: unknown, fallbackLabel?: string): Stat | null {
    if (!isObject(raw)) {
        // A record's value given bare: `{ Revenue: 12000 }`.
        return fallbackLabel === undefined ? null : readStat({ value: raw }, fallbackLabel);
    }
    const r = raw;
    const label = str(pick(r, LABEL_KEYS)) ?? (fallbackLabel !== undefined ? humanizeKey(fallbackLabel) : undefined);
    const rawValue = pick(r, VALUE_KEYS);
    if (!label || rawValue === undefined || (typeof rawValue !== 'number' && typeof rawValue !== 'string')) return null;

    const asked = typeof r['format'] === 'string' && (FORMATS as readonly string[]).includes(r['format']) ? (r['format'] as StatFormat) : undefined;
    const currency = currencyCode(pick(r, ['currency', 'currency_code', 'currencyCode']));
    const unit = str(pick(r, ['unit', 'units']));
    const digitsRaw = num(pick(r, ['digits', 'decimals', 'precision']));
    const digits = digitsRaw !== undefined ? Math.min(6, Math.max(0, Math.round(digitsRaw))) : undefined;

    // The value, and the format it settles: a text that is no number is drawn as given.
    let value: number | string;
    let format: StatFormat;
    let percentScale = false;
    const textPercent = percentText(rawValue);
    const n = amount(rawValue);
    if (textPercent !== undefined && (asked === undefined || asked === 'percent')) {
        // `"12%"` is written in percent: an absolute change of 0.5 beside it is half a point.
        percentScale = true;
        value = textPercent;
        format = 'percent';
    } else if (n === undefined || asked === 'text') {
        // A text is drawn as the tool wrote it — `"12,000"` asked as text stays `12,000`.
        const text = str(rawValue);
        if (!text) return null;
        value = text;
        format = 'text';
    } else if (asked === 'percent') {
        // The value's scale decides an absolute change's too: 12 (%) moved by 0.5 is half a point.
        percentScale = Math.abs(n) > 1;
        value = asRatio(n);
        format = 'percent';
    } else {
        value = n;
        format = asked === 'currency' ? (currency ? 'currency' : 'number') : asked ?? (currency ? 'currency' : 'number');
    }

    // The change: a percentage by the rule, `changePercent` always in percent, or absolute.
    const absolute = r['changeFormat'] === 'absolute' || r['change_format'] === 'absolute';
    let change: number | undefined;
    const percentPoints = amount(pick(r, ['changePercent', 'change_percent', 'percentChange', 'percent_change']));
    const rawChange = pick(r, ['change', 'delta', 'diff', 'variation']);
    const changeText = percentText(rawChange);
    if (!absolute && percentPoints !== undefined) change = percentPoints / 100;
    else if (changeText !== undefined) change = changeText;
    else {
        const c = amount(typeof rawChange === 'string' ? rawChange.replace('−', '-').replace(/^\+/, '') : rawChange);
        if (c !== undefined) change = absolute ? (format === 'percent' && percentScale ? c / 100 : c) : asRatio(c);
    }
    const changeFormat: Stat['changeFormat'] = absolute && changeText === undefined ? 'absolute' : 'percent';

    const icon = typeof r['icon'] === 'string' && Object.hasOwn(STAT_ICONS, r['icon']) ? (r['icon'] as StatIcon) : undefined;
    const changeLabel = str(pick(r, ['changeLabel', 'change_label', 'comparison', 'vs', 'versus']));
    const hint = str(pick(r, ['hint', 'description', 'note', 'caption']));
    const trend = readTrend(pick(r, ['trend', 'history', 'series', 'sparkline', 'values']));
    const good = readGood(r);

    return {
        label,
        value,
        format,
        ...((format === 'currency' || format === 'compact') && currency ? { currency } : {}),
        ...(unit && (format === 'number' || format === 'compact') ? { unit } : {}),
        ...(digits !== undefined ? { digits } : {}),
        ...(change !== undefined ? { change } : {}),
        changeFormat,
        ...(change !== undefined && changeLabel ? { changeLabel } : {}),
        ...(good ? { good } : {}),
        ...(trend ? { trend } : {}),
        ...(hint ? { hint } : {}),
        ...(icon ? { icon } : {}),
    };
}

const CURRENCY_KEYS = ['currency', 'currency_code', 'currencyCode'] as const;
const UNIT_KEYS = ['unit', 'units'] as const;

/**
 * Keys of an envelope that are about the card, not figures of a record. A record's currency
 * and unit say how its figures are written (`{ revenue: 1200, currency: 'EUR' }`).
 */
const META_KEYS = new Set([
    'title', 'heading', 'subtitle', 'period', 'footnote', 'source', 'updatedAt', 'updated_at', 'asOf', 'as_of', 'lastUpdated',
    ...CURRENCY_KEYS, ...UNIT_KEYS,
]);

/** Every key `readStat` reads, and an `id`: an object made only of these is one figure. */
const FIGURE_KEYS = new Set([
    ...LABEL_KEYS, ...VALUE_KEYS, ...CURRENCY_KEYS, ...UNIT_KEYS, 'id', 'format', 'digits', 'decimals', 'precision',
    'change', 'delta', 'diff', 'variation', 'changePercent', 'change_percent', 'percentChange', 'percent_change', 'changeFormat', 'change_format',
    'changeLabel', 'change_label', 'comparison', 'vs', 'versus', 'hint', 'description', 'note', 'caption', 'icon',
    'trend', 'history', 'series', 'sparkline', 'values', 'good', 'better', 'goodDirection', 'good_direction',
    'lowerIsBetter', 'lower_is_better', 'invert', 'inverted', 'higherIsBetter', 'higher_is_better',
]);

/**
 * Whether an object with a label and a value is one figure. A `label`, `name`, `key` or
 * `metric` says so. A `title` is also an envelope's heading: `{ title: 'This week', total:
 * 4200, count: 87, refunds: 3 }` is a week of three figures, not "This week: 87" — so with a
 * `title` it is one figure only when it holds a single value and nothing a figure does not read.
 */
function isOneFigure(r: Raw): boolean {
    if (pick(r, VALUE_KEYS) === undefined) return false;
    if (pick(r, LABEL_KEYS.filter((k) => k !== 'title')) !== undefined) return true;
    if (pick(r, ['title']) === undefined) return false;
    const values = VALUE_KEYS.filter((k) => r[k] !== undefined && r[k] !== null && r[k] !== '');
    return values.length === 1 && Object.keys(r).every((k) => FIGURE_KEYS.has(k) || META_KEYS.has(k));
}

/**
 * Words of a key that name a sum of money. A record's `currency` writes only these figures:
 * `{ revenue: 1200, orders: 30, currency: 'EUR' }` is €1,200 and 30 orders, not €30.
 */
const MONEY_WORDS = new Set([
    'revenue', 'revenues', 'sales', 'income', 'profit', 'profits', 'earnings', 'cost', 'costs', 'spend', 'spending', 'price', 'prices',
    'amount', 'fee', 'fees', 'budget', 'balance', 'payout', 'payouts', 'value', 'gmv', 'mrr', 'arr', 'aov', 'arpu', 'arpa', 'ltv', 'cac',
]);
/** …unless another word makes it a count or a share: `salesCount`, `refundRate`, `revenueGrowth`. */
const NOT_MONEY_WORDS = new Set(['count', 'number', 'rate', 'ratio', 'percent', 'percentage', 'share', 'margin', 'growth', 'change']);

function isMoneyKey(key: string): boolean {
    const words = humanizeKey(key).toLowerCase().split(/\s+/);
    return words.some((w) => MONEY_WORDS.has(w)) && !words.some((w) => NOT_MONEY_WORDS.has(w));
}

/**
 * A record's figure with the record's currency or unit, when it has none of its own: the
 * currency for a key that names money, the unit for every other one. A figure that says its
 * own currency, unit or format keeps it.
 */
function withRecordDefaults(value: unknown, key: string, meta: Raw): unknown {
    const currency = currencyCode(pick(meta, CURRENCY_KEYS));
    const unit = str(pick(meta, UNIT_KEYS));
    if (!currency && !unit) return value;
    const figure: Raw = isObject(value) ? value : { value };
    if (pick(figure, [...CURRENCY_KEYS, ...UNIT_KEYS, 'format']) !== undefined) return value;
    if (currency && isMoneyKey(key)) return { ...figure, currency };
    return unit ? { ...figure, unit } : value;
}

/**
 * The card's data from the loose shape `map` returns — a `{ title, items }` envelope (also
 * `stats`, `metrics`, `kpis`, `figures`), a list of figures, one figure, or a record of
 * label → value pairs (`{ Revenue: 12000 }`, or `{ Revenue: { value: 12000, change: 0.1 } }`)
 * — or `null` when not one figure has a label and a value. At most twelve are kept.
 */
export function readStats(raw: unknown): StatsData | null {
    if (!raw || typeof raw !== 'object') return null;
    let stats: Array<Stat | null>;
    let meta: Raw = {};
    if (Array.isArray(raw)) {
        stats = raw.map((item) => readStat(item));
    } else {
        const r = raw as Raw;
        const list = LIST_KEYS.map((key) => r[key]).find((v) => Array.isArray(v) || isObject(v));
        if (Array.isArray(list)) {
            stats = list.map((item) => readStat(item));
            meta = r;
        } else if (isObject(list)) {
            // `{ title, items: { Revenue: 12000 } }`: the envelope around a record.
            stats = Object.entries(list).map(([key, value]) => readStat(withRecordDefaults(value, key, r), key));
            meta = r;
        } else if (isOneFigure(r)) {
            stats = [readStat(r)];
        } else {
            // A record: every key that is not about the card is a figure's label.
            stats = Object.entries(r).filter(([key]) => !META_KEYS.has(key)).map(([key, value]) => readStat(withRecordDefaults(value, key, r), key));
            meta = r;
        }
    }
    const items = stats.filter((s): s is Stat => s !== null).slice(0, STATS_SHOWN);
    if (!items.length) return null;
    const title = str(pick(meta, ['title', 'heading']));
    const subtitle = str(pick(meta, ['subtitle', 'period']));
    const footnote = str(pick(meta, ['footnote', 'source']));
    const updatedAt = toDate(pick(meta, ['updatedAt', 'updated_at', 'asOf', 'as_of', 'lastUpdated']));
    return {
        ...(title ? { title } : {}),
        ...(subtitle ? { subtitle } : {}),
        items,
        ...(footnote ? { footnote } : {}),
        ...(updatedAt ? { updatedAt } : {}),
    };
}

// ── Writing the numbers ──────────────────────────────────────────────────────

/** `−` as a typographer writes it: `Intl` gives a hyphen-minus. Only on what `Intl` wrote, never on a unit's own text. */
const typographic = (text: string) => text.replace(/-/g, '−');

/** A duration in seconds, its two largest units: `1 hr 20 min`, `45 sec`, `2 days 3 hr`. */
function durationText(config: AparteConfig, seconds: number, digits?: number): string {
    const s = Math.abs(seconds);
    if (s < 60) return formatUnit(config, s, 'second', digits ?? (s < 10 && !Number.isInteger(s) ? 1 : 0));
    const units: Array<[string, number]> = [['day', 86_400], ['hour', 3_600], ['minute', 60], ['second', 1]];
    let rest = Math.round(s);
    const parts: string[] = [];
    for (const [unit, size] of units) {
        const count = Math.floor(rest / size);
        rest -= count * size;
        if (count > 0 || parts.length) parts.push(count > 0 ? formatUnit(config, count, unit) : '');
        if (parts.length === 2) break;
    }
    const shown = parts.filter(Boolean);
    try {
        return new Intl.ListFormat(intlTag(config), { type: 'unit', style: 'narrow' }).format(shown);
    } catch {
        return shown.join(' ');
    }
}

/** The decimals to show: what the figure asks, else the format's habit. */
function fractionDigits(stat: Stat, value: number, fallback: number): Intl.NumberFormatOptions {
    if (stat.digits !== undefined) return { minimumFractionDigits: stat.digits, maximumFractionDigits: stat.digits };
    return { maximumFractionDigits: Number.isInteger(value) ? 0 : fallback };
}

/**
 * A number of `stat` as the chat's language writes it, in the figure's format —
 * its value, or with `signed`, an absolute change of it.
 */
function writeNumber(config: AparteConfig, stat: Stat, value: number, signed = false): string {
    const sign: Intl.NumberFormatOptions = signed ? { signDisplay: 'exceptZero' } : {};
    const done = (text: string) => (signed ? typographic(text) : text);
    switch (stat.format) {
        case 'percent':
            return done(formatNumber(config, value, { style: 'percent', ...(stat.digits !== undefined ? { minimumFractionDigits: stat.digits, maximumFractionDigits: stat.digits } : { maximumFractionDigits: 1 }), ...sign }));
        case 'duration': {
            const text = durationText(config, value, stat.digits);
            return signed && value !== 0 ? `${value > 0 ? '+' : '−'}${text}` : text;
        }
        case 'currency':
            try {
                // Whole sums without their cents — a KPI reads `$12,000`, not `$12,000.00`.
                const digits = stat.digits !== undefined || Number.isInteger(value) ? fractionDigits(stat, value, 2) : {};
                return done(formatNumber(config, value, { style: 'currency', currency: stat.currency!, ...digits, ...sign }));
            } catch {
                return done(`${formatNumber(config, value, { maximumFractionDigits: 2, ...sign })}\u00A0${stat.currency}`);
            }
        case 'compact': {
            const compact: Intl.NumberFormatOptions = { notation: 'compact', maximumFractionDigits: stat.digits ?? 1, ...sign };
            if (stat.currency) {
                try {
                    return done(formatNumber(config, value, { ...compact, style: 'currency', currency: stat.currency }));
                } catch { /* an unknown code: the number, below */ }
            }
            return withUnit(config, stat, value, compact, done);
        }
        default:
            return withUnit(config, stat, value, { ...fractionDigits(stat, value, 2), ...sign }, done);
    }
}

/**
 * The number with the figure's unit: `Intl`'s own when it knows it, else the unit's text
 * after it — outside `done`, so a unit like `e-mails` keeps its hyphen.
 */
function withUnit(config: AparteConfig, stat: Stat, value: number, options: Intl.NumberFormatOptions, done: (text: string) => string): string {
    if (stat.unit && isIntlUnit(stat.unit)) {
        return done(formatNumber(config, value, { ...options, style: 'unit', unit: stat.unit, unitDisplay: 'short' }));
    }
    const n = done(formatNumber(config, value, options));
    return stat.unit ? `${n}\u00A0${stat.unit}` : n;
}

/** The figure's value as drawn: its number in its format, or its text. */
export function statValue(config: AparteConfig, stat: Stat): string {
    return typeof stat.value === 'string' ? stat.value : writeNumber(config, stat, stat.value);
}

/** The change as drawn, signed: `+12%`, `−3.5%`, or `+€1,200` for an absolute one. */
export function statChange(config: AparteConfig, stat: Stat): string | undefined {
    if (stat.change === undefined) return undefined;
    if (stat.changeFormat === 'percent') {
        return typographic(formatNumber(config, stat.change, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }));
    }
    if (typeof stat.value === 'string') {
        return typographic(formatNumber(config, stat.change, { maximumFractionDigits: 2, signDisplay: 'exceptZero' }));
    }
    return writeNumber(config, stat, stat.change, true);
}

type Direction = 'up' | 'down' | 'flat';
type Tone = 'good' | 'bad' | 'neutral';

const directionOf = (change: number): Direction => (change > 0 ? 'up' : change < 0 ? 'down' : 'flat');

/** Green when the figure moved the way it should, red when not, neutral when nobody said. */
function toneOf(stat: Stat): Tone | undefined {
    if (stat.change === undefined) return undefined;
    const direction = directionOf(stat.change);
    if (!stat.good || direction === 'flat') return 'neutral';
    return direction === stat.good ? 'good' : 'bad';
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const notNull = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

/** The arrow is a shape for the eye; the sign in the number says the same to a screen reader. */
const ARROW: Record<Direction, string> = { up: '▲', down: '▼', flat: '' };

/** The change as a pill — arrow and signed number — then what it compares with. */
function changeOf(ctx: CardContext, stat: Stat, { label = true }: { label?: boolean } = {}): HTMLElement | null {
    if (stat.change === undefined) return null;
    const direction = directionOf(stat.change);
    const delta = el('span', { class: 'aparte-stats__delta' });
    ctx.bind(delta, () => statChange(ctx.config, stat)!);
    const tone = toneOf(stat);
    // Green and red are colour alone: a screen reader is told in words which way it went.
    let verdict: HTMLElement | null = null;
    if (tone === 'good' || tone === 'bad') {
        const key = tone === 'good' ? 'cardsStatsGood' : 'cardsStatsBad';
        verdict = el('span', { class: 'aparte-sr-only' });
        ctx.bind(verdict, () => ` ${word(ctx.config, key, S[key])}`);
    }
    // And a mark for the eye that does not tell green from red: the arrow says which way the
    // figure went, the mark whether that is good. Hidden from a screen reader, told the word.
    const mark = tone === 'good' || tone === 'bad'
        ? el('span', { class: 'aparte-stats__verdict', attrs: { 'aria-hidden': 'true' }, text: tone === 'good' ? '✓' : '!' })
        : null;
    const pill = el('span', { class: 'aparte-stats__pill' },
        ARROW[direction] ? el('span', { class: 'aparte-stats__arrow', attrs: { 'aria-hidden': 'true' }, text: ARROW[direction] }) : null,
        delta,
        mark,
        verdict);
    return el('span', { class: 'aparte-stats__change', attrs: { 'data-direction': direction, 'data-tone': tone } },
        pill,
        label && stat.changeLabel ? el('span', { class: 'aparte-stats__change-label', text: stat.changeLabel }) : null);
}

function valueOf(ctx: CardContext, stat: Stat, tag: 'div' | 'dd' | 'span' = 'div'): HTMLElement {
    const node = el(tag, { class: 'aparte-stats__value', attrs: { 'data-format': stat.format } });
    ctx.bind(node, () => statValue(ctx.config, stat));
    return node;
}

function labelOf(stat: Stat, tag: 'div' | 'dt' = 'div'): HTMLElement {
    return el(tag, { class: 'aparte-stats__label' },
        stat.icon ? glyph(STAT_ICONS[stat.icon], 'aparte-rich-card__glyph aparte-stats__icon') : null,
        el('span', { class: 'aparte-stats__label-text', text: stat.label }));
}

function sparkOf(stat: Stat, area = false): HTMLElement | null {
    if (!stat.trend) return null;
    return el('div', { class: 'aparte-stats__spark', attrs: { 'aria-hidden': 'true' } }, sparkline(stat.trend, { area, className: 'aparte-stats__sparkline' }));
}

const hintOf = (stat: Stat) => (stat.hint ? el('div', { class: 'aparte-stats__hint', text: stat.hint }) : null);

/** Where a figure stands, on its root: what the sheet colours its pill and its line by. */
const statAttrs = (stat: Stat) => ({ 'data-tone': toneOf(stat), 'data-trend': stat.trend !== undefined });

/** The heading over the figures: a title, a line under it. */
function head(data: Pick<StatsData, 'title' | 'subtitle'>): HTMLElement | null {
    if (!data.title && !data.subtitle) return null;
    return el('div', { class: 'aparte-stats__head' },
        data.title ? el('div', { class: 'aparte-stats__title', text: data.title }) : null,
        data.subtitle ? el('div', { class: 'aparte-stats__subtitle', text: data.subtitle }) : null);
}

/** The line under the figures: where they come from, and when they were read. */
function foot(ctx: CardContext, data: StatsData): HTMLElement | null {
    if (!data.footnote && !data.updatedAt) return null;
    let when: HTMLElement | null = null;
    if (data.updatedAt) {
        const date = data.updatedAt;
        // A day given alone (`2026-10-30`) reads as local midnight: it is drawn as that day,
        // never as "12:00 AM", a time no one gave.
        const dayOnly = date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
        when = el('time', { class: 'aparte-stats__updated', attrs: { datetime: date.toISOString() } });
        ctx.bind(when, () => word(ctx.config, 'cardsStatsUpdated', S.cardsStatsUpdated, {
            when: dayOnly
                ? new Intl.DateTimeFormat(intlTag(ctx.config), { weekday: 'short', month: 'short', day: 'numeric' }).format(date)
                : formatWhen(ctx.config, date),
        }));
    }
    return el('div', { class: 'aparte-stats__foot' },
        data.footnote ? el('span', { class: 'aparte-stats__footnote', text: data.footnote }) : null,
        when);
}

/** Columns for `n` tiles: never a lone tile on a row of three when two rows of two fit. */
const columnsFor = (n: number) => (n === 1 ? 1 : n === 2 || n === 4 ? 2 : 3);

/** The `tiles` variant: a tile per figure, in a grid that narrows with the card. */
function tiles(ctx: CardContext, items: Stat[]): HTMLElement {
    const list = el('ul', { class: 'aparte-stats__tiles', attrs: { role: 'list', 'data-columns': columnsFor(items.length) } });
    for (const stat of items) {
        list.append(el('li', { class: 'aparte-stats__tile aparte-stats__stat', attrs: statAttrs(stat) },
            labelOf(stat),
            valueOf(ctx, stat),
            changeOf(ctx, stat),
            // The hint before the chart: the charts then sit on one line along a row of tiles.
            hintOf(stat),
            sparkOf(stat)));
    }
    return list;
}

/** The `list` variant: a fact sheet, the label at the start of each row and the value at its end. */
function sheet(ctx: CardContext, items: Stat[]): HTMLElement {
    const list = el('dl', { class: 'aparte-stats__list' });
    for (const stat of items) {
        const term = labelOf(stat, 'dt');
        if (stat.hint) term.append(el('span', { class: 'aparte-stats__hint', text: stat.hint }));
        const value = el('dd', { class: 'aparte-stats__row-value' },
            sparkOf(stat),
            valueOf(ctx, stat, 'span'),
            changeOf(ctx, stat));
        list.append(el('div', { class: 'aparte-stats__row aparte-stats__stat', attrs: statAttrs(stat) }, term, value));
    }
    return list;
}

/** The `hero` variant: the first figure large over its chart, the others small beneath. */
function hero(ctx: CardContext, items: Stat[]): Node[] {
    const [first, ...rest] = items as [Stat, ...Stat[]];
    const main = el('div', { class: 'aparte-stats__hero aparte-stats__stat', attrs: statAttrs(first) },
        labelOf(first),
        el('div', { class: 'aparte-stats__hero-figure' }, valueOf(ctx, first), changeOf(ctx, first)),
        hintOf(first),
        sparkOf(first, true));
    if (!rest.length) return [main];
    const minis = el('dl', { class: 'aparte-stats__minis', attrs: { 'data-count': Math.min(rest.length, 4) } });
    for (const stat of rest) {
        minis.append(el('div', { class: 'aparte-stats__mini aparte-stats__stat', attrs: statAttrs(stat) },
            labelOf(stat, 'dt'),
            valueOf(ctx, stat, 'dd'),
            stat.change !== undefined ? el('dd', { class: 'aparte-stats__mini-change' }, changeOf(ctx, stat, { label: false })) : null));
    }
    return [main, minis];
}

function render(data: StatsData, ctx: CardContext<StatsVariant>): Node[] {
    const body = ctx.variant === 'list' ? [sheet(ctx, data.items)]
        : ctx.variant === 'hero' ? hero(ctx, data.items)
        : [tiles(ctx, data.items)];
    return [head(data), el('div', { class: 'aparte-stats__body' }, ...body), foot(ctx, data)].filter(notNull);
}

function skeleton(partial: Partial<StatsData> | null, ctx: CardContext<StatsVariant>): Node[] {
    const block = (cls: string, kind: 'text' | 'rect' = 'rect') =>
        el('span', { class: `aparte-skeleton aparte-skeleton--${kind} ${cls}`, attrs: { 'aria-hidden': 'true' } });
    // What the figures are about, before they come: the call's input may already say it.
    const heading = partial?.title
        ? head({ title: partial.title })
        : el('div', { class: 'aparte-stats__head' }, block('aparte-stats__sk-title', 'text'));
    let body: HTMLElement;
    if (ctx.variant === 'list') {
        body = el('div', { class: 'aparte-stats__list' }, ...[0, 1, 2, 3].map(() => el('div', { class: 'aparte-stats__row' },
            block('aparte-stats__sk-label', 'text'), block('aparte-stats__sk-value', 'text'))));
    } else if (ctx.variant === 'hero') {
        body = el('div', { class: 'aparte-stats__sk-hero' },
            el('div', { class: 'aparte-stats__hero' },
                block('aparte-stats__sk-label', 'text'), block('aparte-stats__sk-big'), block('aparte-stats__sk-chart')),
            el('div', { class: 'aparte-stats__minis', attrs: { 'data-count': 3 } }, ...[0, 1, 2].map(() => el('div', { class: 'aparte-stats__mini' },
                block('aparte-stats__sk-label', 'text'), block('aparte-stats__sk-value', 'text')))));
    } else {
        body = el('div', { class: 'aparte-stats__tiles', attrs: { 'data-columns': 2 } }, ...[0, 1, 2, 3].map(() => el('div', { class: 'aparte-stats__tile' },
            block('aparte-stats__sk-label', 'text'), block('aparte-stats__sk-big'), block('aparte-stats__sk-pill'))));
    }
    return [heading, el('div', { class: 'aparte-stats__body' }, body)].filter(notNull);
}

function cardLabel(data: Partial<StatsData> | null, ctx: CardContext): string {
    if (data?.title) return data.title;
    const items = data?.items ?? [];
    if (items.length === 1) return items[0]!.label;
    if (items.length > 1) return word(ctx.config, 'cardsStatsCount', S.cardsStatsCount, { n: formatNumber(ctx.config, items.length) });
    return word(ctx.config, 'cardsStatsTitle', S.cardsStatsTitle);
}

export const statsCard = defineCard<StatsData, StatsVariant>({
    name: 'stats',
    variants: ['tiles', 'list', 'hero'],
    styles: statsStyles,
    icon: BARS,
    normalize: readStats,
    render,
    skeleton,
    label: cardLabel,
    // "Revenue: $12,000 (+12% vs last week); Orders: 340" — one clause per figure.
    fallback: (data, ctx) => data.items.map((stat) => {
        const change = statChange(ctx.config, stat);
        const said = change ? ` (${[change, stat.changeLabel].filter(notNull).join(' ')})` : '';
        return `${stat.label}: ${statValue(ctx.config, stat)}${said}`;
    }).join('; '),
    partial: (input) => {
        const about = str(input['title'] ?? input['metric'] ?? input['metrics'] ?? input['query'] ?? input['topic'] ?? input['report']);
        return about ? { title: about } : null;
    },
});

/** Draw a tool's key figures as this card — returns the function that stops it. */
export function setupStatsCard(options: CardSetupOptions<StatsData, StatsVariant> = {}): () => void {
    return statsCard.setup(options);
}
