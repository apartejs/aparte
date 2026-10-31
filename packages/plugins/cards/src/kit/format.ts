/**
 * Numbers, dates and times as the chat's language writes them.
 *
 * Every call reads the locale's `tag`, not the browser's: on a French page a card says
 * `12 %` and `mar.`, on a Japanese one `12%` and `火` — the same rule as the context
 * gauge and the bubble's clock. Nothing here needs a word of ours; `Intl` has them.
 */
import type { AparteConfig } from '@aparte/core';
import { intlTag } from './strings.js';

/** A date from what a tool returns: an ISO string, an epoch (seconds or milliseconds) or a Date. */
export function toDate(value: unknown): Date | null {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number' && Number.isFinite(value)) {
        // Below 10^12 it is seconds (Open-Meteo's `unixtime`, OpenWeather's `dt`).
        const d = new Date(value < 1e12 ? value * 1000 : value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string' && value.trim()) {
        // A day alone (`2026-10-31`) is that day where the reader is. `new Date()` reads it as
        // midnight UTC, which is the evening before anywhere west of Greenwich.
        const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
        if (day) {
            const local = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
            return local.getMonth() === Number(day[2]) - 1 ? local : null;
        }
        const d = new Date(value.trim());
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}

export function formatNumber(config: AparteConfig, value: number, options: Intl.NumberFormatOptions = {}): string {
    return new Intl.NumberFormat(intlTag(config), options).format(value);
}

/**
 * A price in its currency, as the language writes it: `49,00 €`, `€49.00`, `¥4,900`.
 * The currency is an ISO 4217 code (`EUR`); a symbol a tool gives (`€`, `$`) is read for
 * the usual ones. Without a currency, the number alone.
 */
export function formatPrice(config: AparteConfig, amount: number, currency?: string): string {
    const code = currencyCode(currency);
    const plain = () => formatNumber(config, amount, { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 });
    // A currency `Intl` cannot name (`kr`, `zł`, `A$`) is still a currency: written as given.
    if (!code) return typeof currency === 'string' && currency.trim() ? `${plain()} ${currency.trim()}` : plain();
    try {
        return formatNumber(config, amount, { style: 'currency', currency: code });
    } catch {
        return `${formatNumber(config, amount, { maximumFractionDigits: 2 })} ${currency}`;
    }
}

const SYMBOLS: Record<string, string> = { '€': 'EUR', $: 'USD', '£': 'GBP', '¥': 'JPY', '₩': 'KRW', '₽': 'RUB', '₹': 'INR', 'R$': 'BRL', CHF: 'CHF' };

/** An ISO 4217 code from what a tool wrote (`eur`, `€`, `USD`), or `undefined`. */
export function currencyCode(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const v = value.trim();
    if (SYMBOLS[v]) return SYMBOLS[v];
    return /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : undefined;
}

/**
 * The number in a price written as text, with its group and decimal separators. It may open
 * on its decimal separator — `.99`, `$.99` — or the digits after it would be read as 99.
 */
const AMOUNT = /(?:\d|[.,]\d)[\d.,'\s]*/;

/** The dollars a shop writes with their country before the sign. */
const DOLLARS: Record<string, string> = { US: 'USD', CA: 'CAD', A: 'AUD', AU: 'AUD', NZ: 'NZD', HK: 'HKD', S: 'SGD', SG: 'SGD', MX: 'MXN', NT: 'TWD', R: 'BRL' };

let isoCodes: Set<string> | null | undefined;
/** Whether `code` is a currency the runtime knows — `TTC`, or `ALL` in "all included", is a word. */
function isCurrency(code: string): boolean {
    if (isoCodes === undefined) {
        try {
            isoCodes = new Set(Intl.supportedValuesOf('currency'));
        } catch {
            isoCodes = null;
        }
    }
    // A runtime without the list takes a code written in capitals, as ISO 4217 writes them.
    return isoCodes ? isoCodes.has(code) : /^[A-Z]{3}$/.test(code);
}

/**
 * The currency in what is left of a price once its number is out — `€ TTC`, `From $`, `US$`,
 * `GBP incl. VAT`: a country's dollar first (`US$` is not just any `$`), then a sign, then a
 * three-letter code the runtime knows, written in capitals or standing alone.
 */
function currencyIn(text: string): string | undefined {
    const dollar = /(?:^|[^A-Za-z])([A-Z]{1,2})\$/.exec(text);
    if (dollar && DOLLARS[dollar[1]!]) return DOLLARS[dollar[1]!];
    if (/(?:^|[^A-Za-z])CHF(?:$|[^A-Za-z])/.test(text)) return 'CHF';
    const sign = /[€£¥₩₽₹$]/.exec(text);
    if (sign) return currencyCode(sign[0]);
    const words = text.match(/[A-Za-z]+/g) ?? [];
    for (const w of words) {
        const code = w.toUpperCase();
        if (w.length === 3 && (w === code || words.length === 1) && isCurrency(code)) return code;
    }
    return undefined;
}

/**
 * A price a shop or a tool wrote as text — `$1,299.00`, `1.299,00 €`, `49,90`, `29,99 € TTC`,
 * `US$49.90`, `−€5` — read into its amount and currency. The separator that comes last is the
 * decimal one when both are there; a lone comma followed by one or two digits is a decimal
 * comma, otherwise a thousands separator; `1.299` is a German thousands dot. A minus before
 * the number, whatever sits between, makes it negative (an order's discount, a refund).
 * Shared by the product and order cards, which read prices the same way.
 */
export function readPriceText(text: string): { amount?: number; currency?: string } {
    // `\s` takes in the no-break and narrow no-break spaces `Intl` groups digits with.
    const match = AMOUNT.exec(text);
    const currency = currencyIn(text.replace(AMOUNT, ' '));
    if (!match) return currency ? { currency } : {};
    let digits = match[0].replace(/[\s']/g, '').replace(/[.,]+$/, '');
    const dot = digits.lastIndexOf('.');
    const comma = digits.lastIndexOf(',');
    if (dot >= 0 && comma >= 0) {
        const [decimal, group] = dot > comma ? ['.', ','] : [',', '.'];
        digits = digits.split(group).join('').replace(decimal, '.');
    } else if (comma >= 0) {
        digits = /^\d*,\d{1,2}$/.test(digits) ? digits.replace(',', '.') : digits.split(',').join('');
    } else if (dot >= 0 && (digits.indexOf('.') !== dot || /^[1-9]\d{0,2}\.\d{3}$/.test(digits))) {
        digits = digits.split('.').join('');
    }
    const n = Number(digits);
    if (!Number.isFinite(n)) return currency ? { currency } : {};
    const amount = /[-−][^\d]*$/.test(text.slice(0, match.index)) ? -n : n;
    return currency ? { amount, currency } : { amount };
}

/** `0.12` → `12 %` in French, `12%` in English. */
export function formatPercent(config: AparteConfig, ratio: number): string {
    return formatNumber(config, ratio, { style: 'percent', maximumFractionDigits: 0 });
}

/** A value with its unit, as `Intl` writes it: `14 km/h`, `14 km/h`, `9 mph`. */
export function formatUnit(config: AparteConfig, value: number, unit: string, digits = 0): string {
    try {
        return formatNumber(config, value, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: digits });
    } catch {
        // A unit `Intl` does not know: the number, then the unit as given.
        return `${formatNumber(config, value, { maximumFractionDigits: digits })} ${unit}`;
    }
}

/**
 * The day as a person says it: "Today", "Tomorrow", then the weekday ("Thu").
 * The first letter is raised, because `Intl` writes "aujourd’hui" for the middle of a sentence.
 */
export function formatDay(config: AparteConfig, date: Date, style: 'short' | 'long' = 'short', now: Date = new Date()): string {
    const tag = intlTag(config);
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOf(date) - startOf(now)) / 86_400_000);
    let text: string;
    if (days === 0 || days === 1) {
        text = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }).format(days, 'day');
    } else {
        text = new Intl.DateTimeFormat(tag, { weekday: style }).format(date);
    }
    return text.charAt(0).toLocaleUpperCase(tag) + text.slice(1);
}

/**
 * The time, as the language writes it: `2 PM` where the clock has twelve hours, `14:00`
 * where it has twenty-four — never a bare `14`, which is what `{ hour: 'numeric' }`
 * gives in en-GB, Spanish, Italian, Portuguese and Russian.
 */
export function formatHour(config: AparteConfig, date: Date): string {
    const tag = intlTag(config);
    const twelve = /h1[12]/.test(new Intl.DateTimeFormat(tag, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '');
    return twelve
        ? new Intl.DateTimeFormat(tag, { hour: 'numeric', minute: date.getMinutes() ? '2-digit' : undefined }).format(date)
        : new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** Weekday and time, for "as of": `Sat 14:05`. */
export function formatWhen(config: AparteConfig, date: Date): string {
    return new Intl.DateTimeFormat(intlTag(config), { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}
