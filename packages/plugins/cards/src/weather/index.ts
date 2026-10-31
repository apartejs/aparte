/**
 * @aparte/plugin-cards/weather — a tool's weather, drawn as a card.
 *
 *   import { setupWeatherCard, fromOpenMeteo } from '@aparte/plugin-cards/weather';
 *
 *   setupWeatherCard({
 *     tool: 'get_weather',
 *     map: (result) => fromOpenMeteo(result.forecast, { location: result.city }),
 *   });
 *
 * Three variants of one card: `hero` (the sky, the temperature, the next hours), `compact`
 * (one line) and `forecast` (the days ahead, each with its range). Your tool keeps its
 * own fields — `map` says which is which — and three readers turn the codes of the usual
 * APIs into the card's conditions: `conditionFromWmo` (Open-Meteo), `conditionFromOpenWeather`
 * and `conditionFromText`.
 */
import type { AparteConfig } from '@aparte/core';
import { defineCard, type CardContext, type CardSetupOptions } from '../kit/define.js';
import { el, glyph, num, str, type Loose } from '../kit/dom.js';
import { formatDay, formatHour, formatNumber, formatPercent, formatUnit, formatWhen, toDate } from '../kit/format.js';
import { sparkline } from '../kit/sparkline.js';
import { word, type CardWord } from '../kit/strings.js';
import { CONDITION_WORDS, conditionFromText, conditionFromWmo, type WeatherCondition } from './conditions.js';
import { weatherIcon } from './icons.js';
import weatherStyles from './weather.css?raw';

export type WeatherVariant = 'hero' | 'compact' | 'forecast';
export type WindUnit = 'km/h' | 'mph' | 'm/s' | 'kn';

/** One hour ahead. */
export interface WeatherHour {
    time: string | number | Date;
    temperature: number;
    condition?: WeatherCondition | string;
    /** Chance of precipitation, 0–100. */
    precipitation?: number;
    /** OpenWeather's `pop`: the same chance as a share, 0–1, where `1` is certain rain. */
    pop?: number;
    night?: boolean;
}

/** One day ahead. */
export interface WeatherDay {
    date: string | number | Date;
    condition?: WeatherCondition | string;
    high: number;
    low: number;
    /** Chance of precipitation, 0–100. */
    precipitation?: number;
    /** OpenWeather's `pop`: the same chance as a share, 0–1, where `1` is certain rain. */
    pop?: number;
}

/**
 * The weather card's fields — what `map` returns. Only `temperature` (or `daily`) is
 * needed; every other field adds a line when it is there and nothing when it is not.
 */
export interface WeatherInput {
    location?: string;
    /** One of the eleven conditions, or a description `conditionFromText` reads. */
    condition?: WeatherCondition | string;
    /** The tool's own description, in its own language; else the condition's name. */
    summary?: string;
    temperature?: number;
    /** `C` (default) or `F` — `fahrenheit` and OpenWeather's `imperial` read as `F` too. */
    unit?: 'C' | 'F' | 'fahrenheit' | 'imperial' | 'metric';
    feelsLike?: number;
    high?: number;
    low?: number;
    /** 0–100. */
    humidity?: number;
    /** A speed in `km/h`, or `{ speed, unit, direction }` — direction in degrees, where it blows from. */
    wind?: number | { speed: number; unit?: WindUnit; direction?: number };
    /** Chance of precipitation, 0–100. */
    precipitation?: number;
    /** OpenWeather's `pop`: the same chance as a share, 0–1, where `1` is certain rain. */
    pop?: number;
    /** Draw the night sky and the moon. */
    night?: boolean;
    /** When this was measured. */
    time?: string | number | Date;
    hourly?: WeatherHour[];
    daily?: WeatherDay[];
}

/** The data as the card draws it, once read. */
export interface WeatherData {
    location?: string;
    condition: WeatherCondition;
    summary?: string;
    temperature?: number;
    unit: 'C' | 'F';
    feelsLike?: number;
    high?: number;
    low?: number;
    humidity?: number;
    wind?: { speed: number; unit: WindUnit; direction?: number };
    precipitation?: number;
    night: boolean;
    time?: Date;
    hourly: Array<{ time: Date; temperature: number; condition?: WeatherCondition; precipitation?: number; night: boolean }>;
    daily: Array<{ date: Date; condition: WeatherCondition; high: number; low: number; precipitation?: number }>;
}

const W = {
    cardsWeatherTitle: { en: 'Weather', fr: 'Météo', de: 'Wetter', es: 'Tiempo', it: 'Meteo', ja: '天気', ko: '날씨', pt: 'Clima', ru: 'Погода', zh: '天气' },
    cardsWeatherIn: { en: 'Weather in {place}', fr: 'Météo à {place}', de: 'Wetter in {place}', es: 'Tiempo en {place}', it: 'Meteo a {place}', ja: '{place}の天気', ko: '{place} 날씨', pt: 'Clima em {place}', ru: 'Погода: {place}', zh: '{place}天气' },
    cardsWeatherFeelsLike: { en: 'Feels like {t}', fr: 'Ressenti {t}', de: 'Gefühlt {t}', es: 'Sensación {t}', it: 'Percepita {t}', ja: '体感 {t}', ko: '체감 {t}', pt: 'Sensação {t}', ru: 'Ощущается как {t}', zh: '体感 {t}' },
    cardsWeatherHigh: { en: 'High', fr: 'Max.', de: 'Höchst', es: 'Máx.', it: 'Max', ja: '最高', ko: '최고', pt: 'Máx.', ru: 'Макс.', zh: '最高' },
    cardsWeatherLow: { en: 'Low', fr: 'Min.', de: 'Tiefst', es: 'Mín.', it: 'Min', ja: '最低', ko: '최저', pt: 'Mín.', ru: 'Мин.', zh: '最低' },
    cardsWeatherWind: { en: 'Wind', fr: 'Vent', de: 'Wind', es: 'Viento', it: 'Vento', ja: '風', ko: '바람', pt: 'Vento', ru: 'Ветер', zh: '风' },
    cardsWeatherHumidity: { en: 'Humidity', fr: 'Humidité', de: 'Feuchte', es: 'Humedad', it: 'Umidità', ja: '湿度', ko: '습도', pt: 'Umidade', ru: 'Влажность', zh: '湿度' },
    cardsWeatherRain: { en: 'Rain', fr: 'Pluie', de: 'Regen', es: 'Lluvia', it: 'Pioggia', ja: '降水', ko: '강수', pt: 'Chuva', ru: 'Осадки', zh: '降水' },
    cardsWeatherNow: { en: 'Now', fr: 'Maint.', de: 'Jetzt', es: 'Ahora', it: 'Ora', ja: '今', ko: '지금', pt: 'Agora', ru: 'Сейчас', zh: '现在' },
    cardsWeatherForecast: { en: 'Forecast', fr: 'Prévisions', de: 'Vorhersage', es: 'Pronóstico', it: 'Previsioni', ja: '予報', ko: '예보', pt: 'Previsão', ru: 'Прогноз', zh: '预报' },
} satisfies Record<string, CardWord>;

const WIND_INTL: Record<WindUnit, string | null> = { 'km/h': 'kilometer-per-hour', mph: 'mile-per-hour', 'm/s': 'meter-per-second', kn: null };
const HOURS_SHOWN = 8;
const DAYS_SHOWN = 7;

function readCondition(value: unknown): WeatherCondition | undefined {
    if (typeof value === 'number') return conditionFromWmo(value);
    return conditionFromText(value);
}

/** `F` for Fahrenheit however a tool names it — `°F`, `fahrenheit`, OpenWeather's `imperial` — else `C`. */
function readUnit(value: unknown): 'C' | 'F' {
    return typeof value === 'string' && /^\s*°?\s*f\b|fahrenheit|imperial/i.test(value) ? 'F' : 'C';
}

function readWindUnit(value: unknown): WindUnit {
    if (typeof value !== 'string') return 'km/h';
    const v = value.toLowerCase().replace(/\s/g, '');
    if (v.includes('mph') || v.includes('mp/h')) return 'mph';
    if (v === 'm/s' || v === 'ms') return 'm/s';
    if (v.startsWith('kn') || v === 'kt') return 'kn';
    return 'km/h';
}

/**
 * A chance as a percentage, 0–100. A tool writes a share (0.4) or a percentage (40), and
 * the two meet at 1: alone, `1` is 1 %. Where the source is known to write shares — a field
 * that is one by definition (`pop`), or a series that writes a fraction elsewhere — `share`
 * says so, and `1` is then certain.
 */
function percent(value: unknown, share = false): number | undefined {
    const n = num(value);
    if (n === undefined) return undefined;
    const p = n > 0 && n <= 1 && (share || !Number.isInteger(n)) ? n * 100 : n;
    return Math.max(0, Math.min(100, Math.round(p)));
}

/** Whether a series writes its chances as shares: one fraction strictly between 0 and 1 is enough to tell. */
function writesShares(items: Loose[]): boolean {
    return items.some((item) => {
        const n = num(item?.['precipitation']);
        return n !== undefined && n > 0 && n < 1;
    });
}

/** An item's chance of rain: its `precipitation` (a share if its series writes them), else its `pop` (always a share). */
function chanceOf(item: Loose | null | undefined, shares: boolean): number | undefined {
    return percent(item?.['precipitation'], shares) ?? percent(item?.['pop'], true);
}

/** The card's data from the loose shape `map` returns, or `null` when there is no temperature to show. */
export function readWeather(raw: unknown): WeatherData | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const temperature = num(r['temperature'] ?? r['temp']);
    const rawDaily: Loose[] = Array.isArray(r['daily']) ? r['daily'] : [];
    const dailyShares = writesShares(rawDaily);
    const daily = rawDaily
        .map((d: Loose) => {
            const date = toDate(d?.date ?? d?.time);
            const high = num(d?.high ?? d?.max);
            const low = num(d?.low ?? d?.min);
            if (!date || high === undefined || low === undefined) return null;
            return { date, condition: readCondition(d?.condition) ?? 'cloudy', high, low, precipitation: chanceOf(d, dailyShares) };
        })
        .filter(<T>(d: T | null): d is T => d !== null)
        .slice(0, DAYS_SHOWN);
    if (temperature === undefined && daily.length === 0) return null;

    const night = r['night'] === true || r['isDay'] === false || r['is_day'] === 0;
    const rawHourly: Loose[] = Array.isArray(r['hourly']) ? r['hourly'] : [];
    const hourlyShares = writesShares(rawHourly);
    const hourly = rawHourly
        .map((h: Loose) => {
            const time = toDate(h?.time);
            const t = num(h?.temperature ?? h?.temp);
            if (!time || t === undefined) return null;
            return { time, temperature: t, condition: readCondition(h?.condition), precipitation: chanceOf(h, hourlyShares), night: h?.night === true };
        })
        .filter(<T>(h: T | null): h is T => h !== null)
        .slice(0, HOURS_SHOWN);

    let wind: WeatherData['wind'];
    const w = r['wind'];
    if (typeof w === 'number' || typeof w === 'string') {
        const speed = num(w);
        if (speed !== undefined) wind = { speed, unit: readWindUnit(r['windUnit']), direction: num(r['windDirection']) };
    } else if (w && typeof w === 'object') {
        const o = w as Record<string, unknown>;
        const speed = num(o['speed']);
        if (speed !== undefined) wind = { speed, unit: readWindUnit(o['unit']), direction: num(o['direction']) };
    } else if (num(r['windSpeed']) !== undefined) {
        wind = { speed: num(r['windSpeed'])!, unit: readWindUnit(r['windUnit']), direction: num(r['windDirection']) };
    }

    const condition = readCondition(r['condition']) ?? readCondition(r['summary']) ?? daily[0]?.condition ?? 'cloudy';
    return {
        location: str(r['location'] ?? r['city'] ?? r['place']),
        condition,
        summary: str(r['summary'] ?? r['description']),
        temperature,
        unit: readUnit(r['unit']),
        feelsLike: num(r['feelsLike'] ?? r['feels_like']),
        high: num(r['high']) ?? daily[0]?.high,
        low: num(r['low']) ?? daily[0]?.low,
        humidity: percent(r['humidity']),
        wind,
        precipitation: chanceOf(r, false),
        night,
        time: toDate(r['time']) ?? undefined,
        hourly,
        daily,
    };
}

/**
 * Open-Meteo's forecast response (https://open-meteo.com/en/docs) as the card's fields.
 * Ask it for `current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,
 * weather_code,wind_speed_10m,wind_direction_10m`, `hourly=temperature_2m,weather_code,
 * precipitation_probability` and `daily=weather_code,temperature_2m_max,temperature_2m_min,
 * precipitation_probability_max`; whatever it lacks is left out. Open-Meteo returns no
 * place name, so pass it.
 *
 * Its times carry no offset (`2026-10-31T14:00`): they are on the clock of the `timezone`
 * you asked for, GMT by default, and the response says how far that is from UTC
 * (`utc_offset_seconds`). They are read as the instants they are, so the hours show on the
 * reader's own clock whatever the `timezone`; ask `timezone=auto` so the DAYS are the
 * place's own (its "today", and each day's high and low).
 */
export function fromOpenMeteo(response: unknown, options: { location?: string } = {}): WeatherInput {
    const r = (response && typeof response === 'object' ? response : {}) as Loose;
    const current = r['current'] ?? r['current_weather'] ?? {};
    // The units come with whichever block was asked for: a daily-only forecast has no
    // `current_units`, and the legacy `current_weather` has units of its own.
    const cu = r['current_units'] ?? {};
    const cwu = r['current_weather_units'] ?? {};
    const hu = r['hourly_units'] ?? {};
    const du = r['daily_units'] ?? {};
    const unit = readUnit(cu['temperature_2m'] ?? cu['temperature'] ?? cwu['temperature'] ?? du['temperature_2m_max'] ?? du['temperature_2m_min'] ?? hu['temperature_2m']);
    const windUnit = readWindUnit(cu['wind_speed_10m'] ?? cu['windspeed'] ?? cwu['windspeed'] ?? cwu['wind_speed_10m'] ?? hu['wind_speed_10m'] ?? du['wind_speed_10m_max']);
    const offset = num(r['utc_offset_seconds']);
    const instant = (time: unknown): Date | null => openMeteoTime(time, offset);
    const nowMs = instant(current['time'])?.getTime() ?? Date.now();

    const hourly: WeatherHour[] = [];
    const h = r['hourly'];
    if (h && Array.isArray(h['time'])) {
        h['time'].forEach((time: unknown, i: number) => {
            const at = instant(time);
            const t = num(h['temperature_2m']?.[i]);
            // From the current hour on.
            if (!at || t === undefined || at.getTime() < nowMs - 3_600_000) return;
            hourly.push({
                time: at,
                temperature: t,
                condition: conditionFromWmo(h['weather_code']?.[i]),
                precipitation: num(h['precipitation_probability']?.[i]),
                night: h['is_day']?.[i] === 0,
            });
        });
    }
    const daily: WeatherDay[] = [];
    const d = r['daily'];
    if (d && Array.isArray(d['time'])) {
        d['time'].forEach((date: unknown, i: number) => {
            const high = num(d['temperature_2m_max']?.[i]);
            const low = num(d['temperature_2m_min']?.[i]);
            if (high === undefined || low === undefined) return;
            daily.push({
                date: date as string,
                condition: conditionFromWmo(d['weather_code']?.[i]),
                high,
                low,
                precipitation: num(d['precipitation_probability_max']?.[i]),
            });
        });
    }
    return {
        location: options.location,
        condition: conditionFromWmo(current['weather_code'] ?? current['weathercode']),
        temperature: num(current['temperature_2m'] ?? current['temperature']),
        unit,
        feelsLike: num(current['apparent_temperature']),
        humidity: num(current['relative_humidity_2m']),
        wind: num(current['wind_speed_10m'] ?? current['windspeed']) !== undefined
            ? { speed: num(current['wind_speed_10m'] ?? current['windspeed'])!, unit: windUnit, direction: num(current['wind_direction_10m'] ?? current['winddirection']) }
            : undefined,
        precipitation: num(hourly[0]?.precipitation),
        night: current['is_day'] === 0,
        time: instant(current['time']) ?? undefined,
        hourly: hourly.slice(0, HOURS_SHOWN),
        daily: daily.slice(0, DAYS_SHOWN),
    } as WeatherInput;
}

/**
 * One of Open-Meteo's times as an instant. A date-time with no offset is on the response's
 * clock, `offset` seconds from UTC, where `new Date()` would read it on the READER's clock.
 * An epoch (`timeformat=unixtime`) is already an instant, and a response that gives no
 * offset is read as before.
 */
function openMeteoTime(value: unknown, offset: number | undefined): Date | null {
    const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim()) : null;
    if (!m || offset === undefined) return toDate(value);
    const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
    return new Date(utc - offset * 1000);
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const deg = (config: AparteConfig, t: number) => `${formatNumber(config, Math.round(t))}°`;
const degFull = (config: AparteConfig, t: number, unit: 'C' | 'F') => formatUnit(config, Math.round(t), unit === 'F' ? 'fahrenheit' : 'celsius');

function summaryOf(data: WeatherData, config: AparteConfig): string {
    return data.summary ?? word(config, `cardsWeather_${data.condition}`, CONDITION_WORDS[data.condition]);
}

function windText(config: AparteConfig, wind: NonNullable<WeatherData['wind']>): string {
    const intl = WIND_INTL[wind.unit];
    return intl ? formatUnit(config, wind.speed, intl) : `${formatNumber(config, Math.round(wind.speed))} kn`;
}

/** A label above its value, for the stats row. */
function stat(ctx: CardContext, key: keyof typeof W, value: () => string, extra?: Node): HTMLElement {
    const dt = el('dt', { class: 'aparte-weather__stat-label' });
    ctx.word(dt, key, W[key]);
    const dd = el('dd', { class: 'aparte-weather__stat-value' });
    const text = el('span');
    ctx.bind(text, value);
    dd.append(...(extra ? [extra, text] : [text]));
    return el('div', { class: 'aparte-weather__stat', attrs: { 'data-stat': key.replace('cardsWeather', '').toLowerCase() } }, dt, dd);
}

function rangeText(ctx: CardContext, data: WeatherData): HTMLElement | null {
    if (data.high === undefined && data.low === undefined) return null;
    const range = el('span', { class: 'aparte-weather__range' });
    if (data.high !== undefined) {
        const hi = el('span', { class: 'aparte-weather__hi' });
        ctx.bind(hi, () => `↑ ${deg(ctx.config, data.high!)}`);
        ctx.bind(hi, () => `${word(ctx.config, 'cardsWeatherHigh', W.cardsWeatherHigh)} ${degFull(ctx.config, data.high!, data.unit)}`, 'aria-label');
        range.append(hi);
    }
    if (data.low !== undefined) {
        const lo = el('span', { class: 'aparte-weather__lo' });
        ctx.bind(lo, () => `↓ ${deg(ctx.config, data.low!)}`);
        ctx.bind(lo, () => `${word(ctx.config, 'cardsWeatherLow', W.cardsWeatherLow)} ${degFull(ctx.config, data.low!, data.unit)}`, 'aria-label');
        range.append(lo);
    }
    return range;
}

function placeLine(ctx: CardContext, data: WeatherData): HTMLElement {
    const place = el('div', { class: 'aparte-weather__place' });
    const name = el('span', { class: 'aparte-weather__location' });
    ctx.bind(name, () => data.location ?? word(ctx.config, 'cardsWeatherTitle', W.cardsWeatherTitle));
    place.append(name);
    if (data.time) {
        const when = el('time', { class: 'aparte-weather__when', attrs: { datetime: data.time.toISOString() } });
        ctx.bind(when, () => formatWhen(ctx.config, data.time!));
        place.append(when);
    }
    return place;
}

/** The sky behind the hero and the forecast's header: a gradient per condition, by day or by night. */
function sky(data: WeatherData): HTMLElement {
    return el('div', { class: 'aparte-weather__sky', attrs: { 'data-condition': data.condition, 'data-night': data.night, 'aria-hidden': 'true' } });
}

function hours(ctx: CardContext, data: WeatherData): HTMLElement | null {
    if (data.hourly.length < 2) return null;
    const temps = data.hourly.map((h) => h.temperature);
    const list = el('ol', { class: 'aparte-weather__hours' });
    data.hourly.forEach((h, i) => {
        const time = el('span', { class: 'aparte-weather__hour-time' });
        if (i === 0) ctx.word(time, 'cardsWeatherNow', W.cardsWeatherNow);
        else ctx.bind(time, () => formatHour(ctx.config, h.time));
        const temp = el('span', { class: 'aparte-weather__hour-temp' });
        ctx.bind(temp, () => deg(ctx.config, h.temperature));
        const cond = h.condition ?? data.condition;
        // The glyph is hidden from a screen reader, so the hour's sky is also said in words.
        const sky = el('span', { class: 'aparte-sr-only' });
        ctx.word(sky, `cardsWeather_${cond}`, CONDITION_WORDS[cond]);
        let rain: HTMLElement | null = null;
        if (h.precipitation !== undefined && h.precipitation >= 30) {
            rain = el('span', { class: 'aparte-weather__hour-rain' });
            ctx.bind(rain, () => formatPercent(ctx.config, h.precipitation! / 100));
        }
        list.append(el('li', { class: 'aparte-weather__hour' }, time, sky, glyph(weatherIcon(cond, h.night), 'aparte-rich-card__glyph aparte-weather__mini'), rain, temp));
    });
    const strip = el('div', { class: 'aparte-weather__hourly' },
        el('div', { class: 'aparte-weather__curve' }, sparkline(temps, { area: true, pad: 0.2 })),
        list);
    strip.style.setProperty('--aparte-weather-hours', String(data.hourly.length));
    return strip;
}

function renderHero(data: WeatherData, ctx: CardContext): Node[] {
    const { config } = ctx;
    const head = el('div', { class: 'aparte-weather__head' }, placeLine(ctx, data), glyph(weatherIcon(data.condition, data.night), 'aparte-rich-card__glyph aparte-weather__icon'));
    const now = el('div', { class: 'aparte-weather__now' });
    if (data.temperature !== undefined) {
        const temp = el('span', { class: 'aparte-weather__temp' });
        ctx.bind(temp, () => deg(config, data.temperature!));
        ctx.bind(temp, () => degFull(config, data.temperature!, data.unit), 'aria-label');
        now.append(temp);
    }
    const text = el('div', { class: 'aparte-weather__now-text' });
    const summary = el('span', { class: 'aparte-weather__summary' });
    ctx.bind(summary, () => summaryOf(data, config));
    text.append(summary);
    const line = el('span', { class: 'aparte-weather__line' });
    const range = rangeText(ctx, data);
    if (range) line.append(range);
    if (data.feelsLike !== undefined) {
        const feels = el('span', { class: 'aparte-weather__feels' });
        ctx.bind(feels, () => word(config, 'cardsWeatherFeelsLike', W.cardsWeatherFeelsLike, { t: deg(config, data.feelsLike!) }));
        line.append(feels);
    }
    if (line.childNodes.length) text.append(line);
    now.append(text);

    const stats = el('dl', { class: 'aparte-weather__stats' });
    if (data.wind) {
        const arrow = data.wind.direction !== undefined
            ? el('span', { class: 'aparte-weather__wind-arrow', attrs: { 'aria-hidden': 'true', style: `--aparte-weather-wind-angle: ${Math.round(data.wind.direction + 180)}deg` }, text: '↑' })
            : undefined;
        stats.append(stat(ctx, 'cardsWeatherWind', () => windText(config, data.wind!), arrow));
    }
    if (data.humidity !== undefined) stats.append(stat(ctx, 'cardsWeatherHumidity', () => formatUnit(config, data.humidity!, 'percent')));
    if (data.precipitation !== undefined) stats.append(stat(ctx, 'cardsWeatherRain', () => formatUnit(config, data.precipitation!, 'percent')));

    const body = el('div', { class: 'aparte-weather__body' }, head, now);
    if (stats.childNodes.length) body.append(stats);
    const hourly = hours(ctx, data);
    if (hourly) body.append(hourly);
    return [sky(data), body];
}

function renderCompact(data: WeatherData, ctx: CardContext): Node[] {
    const { config } = ctx;
    const row = el('div', { class: 'aparte-weather__compact' });
    row.append(glyph(weatherIcon(data.condition, data.night), 'aparte-rich-card__glyph aparte-weather__icon'));
    if (data.temperature !== undefined) {
        const temp = el('span', { class: 'aparte-weather__temp' });
        ctx.bind(temp, () => deg(config, data.temperature!));
        ctx.bind(temp, () => degFull(config, data.temperature!, data.unit), 'aria-label');
        row.append(temp);
    }
    const text = el('div', { class: 'aparte-weather__compact-text' });
    const name = el('span', { class: 'aparte-weather__location' });
    ctx.bind(name, () => data.location ?? word(config, 'cardsWeatherTitle', W.cardsWeatherTitle));
    const summary = el('span', { class: 'aparte-weather__summary' });
    ctx.bind(summary, () => summaryOf(data, config));
    text.append(name, summary);
    row.append(text);
    const range = rangeText(ctx, data);
    if (range) row.append(range);
    return [el('span', { class: 'aparte-weather__accent', attrs: { 'data-condition': data.condition, 'data-night': data.night, 'aria-hidden': 'true' } }), row];
}

/** A colour for a temperature in °C, from cold blue to hot red, for the day's range bar. */
function heat(celsius: number): string {
    const stops: Array<[number, [number, number, number]]> = [
        [-10, [129, 140, 248]], [0, [96, 165, 250]], [10, [52, 211, 153]], [18, [250, 204, 21]], [26, [251, 146, 60]], [34, [239, 68, 68]],
    ];
    if (celsius <= stops[0]![0]) return `rgb(${stops[0]![1].join(' ')})`;
    for (let i = 1; i < stops.length; i++) {
        const [t1, c1] = stops[i]!;
        const [t0, c0] = stops[i - 1]!;
        if (celsius <= t1) {
            const k = (celsius - t0) / (t1 - t0);
            return `rgb(${c0.map((v, j) => Math.round(v + (c1[j]! - v) * k)).join(' ')})`;
        }
    }
    return `rgb(${stops[stops.length - 1]![1].join(' ')})`;
}

function renderForecast(data: WeatherData, ctx: CardContext): Node[] {
    const { config } = ctx;
    // The sky only behind the header: the days below sit on the card's surface.
    const header = el('div', { class: 'aparte-weather__forecast-head' }, sky(data));
    header.append(...renderCompact(data, ctx).slice(1));
    if (data.daily.length === 0) return [header];
    const toC = (t: number) => (data.unit === 'F' ? ((t - 32) * 5) / 9 : t);
    const lo = Math.min(...data.daily.map((d) => d.low));
    const hi = Math.max(...data.daily.map((d) => d.high));
    const span = hi - lo || 1;
    const list = el('ol', { class: 'aparte-weather__days' });
    ctx.bind(list, () => word(config, 'cardsWeatherForecast', W.cardsWeatherForecast), 'aria-label');
    data.daily.forEach((d, i) => {
        const name = el('span', { class: 'aparte-weather__day-name' });
        ctx.bind(name, () => formatDay(config, d.date, 'short'));
        const rain = el('span', { class: 'aparte-weather__day-rain' });
        if (d.precipitation !== undefined && d.precipitation >= 20) ctx.bind(rain, () => formatPercent(config, d.precipitation! / 100));
        const low = el('span', { class: 'aparte-weather__day-low' });
        ctx.bind(low, () => deg(config, d.low));
        const high = el('span', { class: 'aparte-weather__day-high' });
        ctx.bind(high, () => deg(config, d.high));
        const fill = el('span', { class: 'aparte-weather__bar-fill' });
        fill.style.setProperty('--aparte-weather-bar-start', `${((d.low - lo) / span) * 100}%`);
        fill.style.setProperty('--aparte-weather-bar-end', `${((d.high - lo) / span) * 100}%`);
        fill.style.setProperty('--aparte-weather-bar-cold', heat(toC(d.low)));
        fill.style.setProperty('--aparte-weather-bar-warm', heat(toC(d.high)));
        const bar = el('span', { class: 'aparte-weather__bar', attrs: { 'aria-hidden': 'true' } }, fill);
        if (i === 0 && data.temperature !== undefined && data.temperature >= d.low && data.temperature <= d.high) {
            const dot = el('span', { class: 'aparte-weather__bar-now' });
            dot.style.setProperty('--aparte-weather-bar-at', `${((data.temperature - lo) / span) * 100}%`);
            bar.append(dot);
        }
        const row = el('li', { class: 'aparte-weather__day' }, name, glyph(weatherIcon(d.condition), 'aparte-rich-card__glyph aparte-weather__mini'), rain, low, bar, high);
        ctx.bind(row, () => `${formatDay(config, d.date, 'long')}: ${word(config, `cardsWeather_${d.condition}`, CONDITION_WORDS[d.condition])}, ${word(config, 'cardsWeatherLow', W.cardsWeatherLow)} ${degFull(config, d.low, data.unit)}, ${word(config, 'cardsWeatherHigh', W.cardsWeatherHigh)} ${degFull(config, d.high, data.unit)}`, 'aria-label');
        list.append(row);
    });
    return [header, list];
}

function skeleton(partial: Partial<WeatherData> | null, ctx: CardContext): Node[] {
    const block = (cls: string, kind: 'text' | 'rect' | 'circle' = 'rect') =>
        el('span', { class: `aparte-skeleton aparte-skeleton--${kind} ${cls}`, attrs: { 'aria-hidden': 'true' } });
    const place = el('div', { class: 'aparte-weather__place' });
    if (partial?.location) place.append(el('span', { class: 'aparte-weather__location', text: partial.location }));
    else place.append(block('aparte-weather__sk-place', 'text'));
    const head = el('div', { class: 'aparte-weather__head' }, place, block('aparte-weather__sk-icon', 'circle'));
    if (ctx.variant === 'compact') {
        return [el('div', { class: 'aparte-weather__compact' }, block('aparte-weather__sk-icon', 'circle'), block('aparte-weather__sk-temp'), place)];
    }
    const stats = el('div', { class: 'aparte-weather__sk-stats' }, block('aparte-weather__sk-stat'), block('aparte-weather__sk-stat'), block('aparte-weather__sk-stat'));
    return [el('div', { class: 'aparte-weather__body' }, head, el('div', { class: 'aparte-weather__now' }, block('aparte-weather__sk-temp'), block('aparte-weather__sk-summary', 'text')), stats)];
}

export const weatherCard = defineCard<WeatherData, WeatherVariant>({
    name: 'weather',
    variants: ['hero', 'compact', 'forecast'],
    styles: weatherStyles,
    icon: weatherIcon('partly-cloudy'),
    normalize: readWeather,
    render: (data, ctx) => (ctx.variant === 'compact' ? renderCompact(data, ctx) : ctx.variant === 'forecast' ? renderForecast(data, ctx) : renderHero(data, ctx)),
    skeleton,
    label: (data, ctx) => (data?.location
        ? word(ctx.config, 'cardsWeatherIn', W.cardsWeatherIn, { place: data.location })
        : word(ctx.config, 'cardsWeatherTitle', W.cardsWeatherTitle)),
    fallback: (data, ctx) => {
        const parts = [
            data.temperature !== undefined ? degFull(ctx.config, data.temperature, data.unit) : null,
            summaryOf(data, ctx.config),
            data.high !== undefined && data.low !== undefined
                ? `${word(ctx.config, 'cardsWeatherHigh', W.cardsWeatherHigh)} ${degFull(ctx.config, data.high, data.unit)} / ${word(ctx.config, 'cardsWeatherLow', W.cardsWeatherLow)} ${degFull(ctx.config, data.low, data.unit)}`
                : null,
        ].filter(Boolean);
        return `${data.location ? `${data.location}: ` : ''}${parts.join(', ')}`;
    },
    partial: (input) => {
        const location = str(input['location'] ?? input['city'] ?? input['place'] ?? input['q'] ?? input['query']);
        return location ? { location } : null;
    },
});

/** Draw a tool's weather as this card — returns the function that stops it. */
export function setupWeatherCard(options: CardSetupOptions<WeatherData, WeatherVariant> = {}): () => void {
    return weatherCard.setup(options);
}

export { conditionFromWmo, conditionFromOpenWeather, conditionFromText, WEATHER_CONDITIONS } from './conditions.js';
export type { WeatherCondition } from './conditions.js';
