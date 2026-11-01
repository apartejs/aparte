/**
 * @aparte/plugin-cards/place — a tool's places, drawn as cards: a restaurant, a shop, a
 * hotel, a venue, with its rating, whether it is open now, and the way there.
 *
 *   import { setupPlaceCard } from '@aparte/plugin-cards/place';
 *
 *   setupPlaceCard({ tool: 'search_places', map: (result) => result.results });
 *
 * One place or several (`[...]`, or `{ title, places: [...] }`). Three variants of one
 * card: `card` (a tile with its photo; several scroll sideways), `compact` (one row each,
 * stacked) and `detail` (one place in full, with its week of opening hours). Your tool keeps
 * its own fields: `readPlaces` reads the usual names for each (Google Places, both
 * generations, Yelp, OpenStreetMap-ish tools, what a model writes by hand), and `map` says
 * the rest.
 *
 * Whether a place is open is worked out when the card is drawn, from its weekly `hours`
 * (`isOpenAt`, `placeStatus`) — Google's current hours, holidays included, before its
 * regular week — else from the tool's own `openNow`. The three buttons a place
 * gets for free — Directions, Call, Website — appear only when its data can honour them,
 * and an app that passes its own `actions` replaces them.
 */
import type { AparteConfig } from '@aparte/core';
import { carousel } from '../kit/carousel.js';
import { defineCard, type CardContext, type CardSetupOptions } from '../kit/define.js';
import { el, glyph, num, safeUrl, str, type Loose } from '../kit/dom.js';
import { formatNumber, formatUnit } from '../kit/format.js';
import { rating } from '../kit/rating.js';
import { intlTag, word, type CardWord } from '../kit/strings.js';
import { CLOCK, DIRECTIONS, GLOBE, PHONE, PIN, kindGlyph, type PlaceKind } from './icons.js';
import placeStyles from './place.css?raw';

export type { PlaceKind } from './icons.js';
export type PlaceVariant = 'card' | 'compact' | 'detail';

/** One opening range of the week, as a tool writes it. */
export interface PlaceHoursInput {
    /** 0 = Sunday … 6 = Saturday (7 reads as Sunday too), or an English day name ("mon", "Monday"). */
    day: number | string;
    /** "09:00", "9:30", "0900", "21h30", "9 PM". */
    open: string;
    /** Past midnight is fine ("02:00" after "18:00"). Missing, or "24:00", is midnight. */
    close?: string;
}

/** An opening range once read: minutes from the start of `day`. `end` passes 1440 when it closes after midnight. */
export interface PlaceHoursRange {
    day: number;
    start: number;
    end: number;
}

/**
 * A place as `map` returns it. Only `name` is needed; every other field adds a line when it
 * is there and nothing when it is not. `readPlaces` also reads the usual aliases (listed on
 * each field).
 */
export interface PlaceInput {
    /** Also `title`, `displayName`. */
    name: string;
    /** Shown as it is: "Trattoria", "Boulangerie". Also `primaryTypeDisplayName`, `categories[0]`. */
    category?: string;
    /** Google's `types`, read only to choose a glyph and, without `category`, a word. */
    types?: string[];
    /** An `http(s)` photo. Also `photo`, `imageUrl`, `thumbnail`, `photos[0]`. */
    image?: string;
    /** 0–5 (a 10-point score is halved). */
    rating?: number;
    /** Also `user_ratings_total`, `userRatingCount`, `reviews`, `review_count`. */
    reviewCount?: number;
    /** 1–4, `"€€"`, or Google's `"PRICE_LEVEL_MODERATE"`; any other text is shown as it is ("€10–20"). Also `price_level`. */
    priceLevel?: number | string;
    /** Also `formatted_address`, `formattedAddress`, `vicinity`, Yelp's `location.display_address`. */
    address?: string;
    /** In metres; a text ("12 min walk") is shown as it is. Also `distanceMeters`. */
    distance?: number | string;
    /** Also `formatted_phone_number`, `international_phone_number`, `nationalPhoneNumber`. */
    phone?: string;
    /** The place's own site. Also `websiteUri`. */
    website?: string;
    /** The place's page (on a map, a guide); the name links to it. Also `googleMapsUri`. */
    url?: string;
    /** Also `lat`/`lng`, `latitude`/`longitude`, `geometry.location`, `location`. */
    coordinates?: { lat: number; lng: number };
    /** Google's place id, which makes Directions land on the place itself. Also `place_id`. */
    placeId?: string;
    /** The tool's own answer; `hours` wins when both are given. Also `open_now`, `isOpen`, `opening_hours.open_now`, Yelp's `hours[0].is_open_now`. */
    openNow?: boolean;
    /**
     * The week's opening hours: `[{ day, open, close }]` (several ranges a day, closing past
     * midnight), Google's `periods` or `weekday_text`, Yelp's `hours`, or
     * `{ monday: "09:00-18:00", sunday: "closed" }`. Also `currentOpeningHours` (read first:
     * it has the holidays), `regularOpeningHours`, `opening_hours`, `openingHours`.
     */
    hours?: PlaceHoursInput[] | Record<string, unknown> | string[];
    /** The place's offset from UTC in minutes, so "Open now" is read on the place's clock. Also `utc_offset_minutes`. */
    utcOffset?: number;
    /** At most four short facts: "Terrace", "Vegan". Also `features`, `amenities`. */
    tags?: string[];
}

/** A price level once read: the tier, and the sign the source wrote it with, if it did. */
export interface PlacePrice {
    level: number;
    symbol?: string;
}

/** A place as the card draws it, once read. */
export interface Place {
    name: string;
    category?: string;
    kind: PlaceKind;
    image?: string;
    rating?: number;
    reviewCount?: number;
    price?: PlacePrice;
    priceText?: string;
    address?: string;
    distance?: number;
    distanceText?: string;
    phone?: string;
    website?: string;
    url?: string;
    coordinates?: { lat: number; lng: number };
    placeId?: string;
    openNow?: boolean;
    hours: PlaceHoursRange[];
    utcOffset?: number;
    tags: string[];
}

/** The card's data: one place or several, and the collection's title. */
export interface PlaceData {
    title?: string;
    places: Place[];
}

/** Whether a place is open at a moment, and when that changes (none: it never does). */
export interface PlaceStatus {
    open: boolean;
    changesAt?: Date;
}

/** How an app plugs the place card in: the kit's options, and two of the card's own. */
export interface PlaceCardOptions extends CardSetupOptions<PlaceData, PlaceVariant> {
    /**
     * The sign a price TIER (1–4) is drawn with. A tier is a scale, not an amount — Google
     * and Yelp return a number, not a currency — so the card cannot know the place's money.
     * `$` by default, the sign those APIs' own documentation uses; a European app passes `€`.
     * A tier the source wrote with its own sign ("€€") keeps it. Read aloud as
     * "Price level 2 of 4" either way.
     */
    currencySymbol?: string;
    /** The clock "Open now" is read against — the device's by default; a test or a replay passes its own. */
    now?: () => Date;
    /**
     * The Directions / Call / Website buttons on each place, drawn from its data (`true` by
     * default). They are the place's own; the app's `actions` are the card's, under it, and
     * one does not replace the other. `false` draws none.
     */
    builtIns?: boolean;
    /**
     * A real map behind a place that has coordinates and no photo: the address of your
     * map tiles, `{z}`, `{x}` and `{y}` in it (OpenStreetMap's, MapTiler's or Stadia's with
     * your key in the address, your own server's). Unset — the default — the card draws its
     * own map and fetches nothing: tiles are requests to a third party, which sees the
     * visitor and the place, so they are the app's choice. A tile that fails to load brings
     * the drawn map back.
     *
     * @example
     * setupPlaceCard({
     *   mapTiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
     *   mapAttribution: '© OpenStreetMap contributors',
     * });
     */
    mapTiles?: string;
    /** The credit the tiles' provider asks for, shown on the map. Most require one. */
    mapAttribution?: string;
    /** How close the map is, as tile servers count it: 16 by default, a street and its neighbours. */
    mapZoom?: number;
}

const P = {
    cardsPlaceTitle: { en: 'Places', fr: 'Lieux', de: 'Orte', es: 'Lugares', it: 'Luoghi', ja: '場所', ko: '장소', pt: 'Lugares', ru: 'Места', zh: '地点' },
    cardsPlaceCount: { en: '{n} places', fr: '{n} lieux', de: '{n} Orte', es: '{n} lugares', it: '{n} luoghi', ja: '{n}件の場所', ko: '장소 {n}곳', pt: '{n} lugares', ru: 'Мест: {n}', zh: '{n} 个地点' },
    cardsPlaceOpen: { en: 'Open', fr: 'Ouvert', de: 'Geöffnet', es: 'Abierto', it: 'Aperto', ja: '営業中', ko: '영업 중', pt: 'Aberto', ru: 'Открыто', zh: '营业中' },
    cardsPlaceClosed: { en: 'Closed', fr: 'Fermé', de: 'Geschlossen', es: 'Cerrado', it: 'Chiuso', ja: '営業時間外', ko: '영업 종료', pt: 'Fechado', ru: 'Закрыто', zh: '已打烊' },
    cardsPlaceClosesSoon: { en: 'Closes soon', fr: 'Ferme bientôt', de: 'Schließt bald', es: 'Cierra pronto', it: 'Chiude a breve', ja: 'まもなく営業終了', ko: '곧 영업 종료', pt: 'Fecha em breve', ru: 'Скоро закроется', zh: '即将打烊' },
    cardsPlaceClosesAt: { en: 'Closes at {t}', fr: 'Ferme à {t}', de: 'Schließt um {t}', es: 'Cierra a las {t}', it: 'Chiude alle {t}', ja: '{t}に営業終了', ko: '{t}에 영업 종료', pt: 'Fecha às {t}', ru: 'Закроется в {t}', zh: '{t}打烊' },
    cardsPlaceClosesOn: { en: 'Closes {day} at {t}', fr: 'Ferme {day} à {t}', de: 'Schließt {day} um {t}', es: 'Cierra el {day} a las {t}', it: 'Chiude {day} alle {t}', ja: '{day}の{t}に営業終了', ko: '{day} {t}에 영업 종료', pt: 'Fecha {day} às {t}', ru: 'Закроется: {day}, {t}', zh: '{day}{t}打烊' },
    cardsPlaceOpensAt: { en: 'Opens at {t}', fr: 'Ouvre à {t}', de: 'Öffnet um {t}', es: 'Abre a las {t}', it: 'Apre alle {t}', ja: '{t}に営業開始', ko: '{t}에 영업 시작', pt: 'Abre às {t}', ru: 'Откроется в {t}', zh: '{t}开始营业' },
    cardsPlaceOpensTomorrow: { en: 'Opens tomorrow at {t}', fr: 'Ouvre demain à {t}', de: 'Öffnet morgen um {t}', es: 'Abre mañana a las {t}', it: 'Apre domani alle {t}', ja: '明日{t}に営業開始', ko: '내일 {t}에 영업 시작', pt: 'Abre amanhã às {t}', ru: 'Откроется завтра в {t}', zh: '明天{t}开始营业' },
    cardsPlaceOpensOn: { en: 'Opens {day} at {t}', fr: 'Ouvre {day} à {t}', de: 'Öffnet {day} um {t}', es: 'Abre el {day} a las {t}', it: 'Apre {day} alle {t}', ja: '{day}の{t}に営業開始', ko: '{day} {t}에 영업 시작', pt: 'Abre {day} às {t}', ru: 'Откроется: {day}, {t}', zh: '{day}{t}开始营业' },
    cardsPlaceAlwaysOpen: { en: 'Open 24 hours', fr: 'Ouvert 24 h/24', de: 'Rund um die Uhr geöffnet', es: 'Abierto 24 horas', it: 'Aperto 24 ore su 24', ja: '24時間営業', ko: '24시간 영업', pt: 'Aberto 24 horas', ru: 'Круглосуточно', zh: '24小时营业' },
    cardsPlaceDirections: { en: 'Directions', fr: 'Itinéraire', de: 'Route', es: 'Cómo llegar', it: 'Indicazioni', ja: 'ルート', ko: '길찾기', pt: 'Rotas', ru: 'Маршрут', zh: '路线' },
    cardsPlaceCall: { en: 'Call', fr: 'Appeler', de: 'Anrufen', es: 'Llamar', it: 'Chiama', ja: '電話', ko: '전화', pt: 'Ligar', ru: 'Позвонить', zh: '致电' },
    cardsPlaceWebsite: { en: 'Website', fr: 'Site web', de: 'Website', es: 'Sitio web', it: 'Sito web', ja: 'ウェブサイト', ko: '웹사이트', pt: 'Site', ru: 'Сайт', zh: '网站' },
    cardsPlaceHours: { en: 'Hours', fr: 'Horaires', de: 'Öffnungszeiten', es: 'Horario', it: 'Orari', ja: '営業時間', ko: '영업시간', pt: 'Horário', ru: 'Часы работы', zh: '营业时间' },
    cardsPlacePrice: { en: 'Price level {level} of {max}', fr: 'Gamme de prix {level} sur {max}', de: 'Preisniveau {level} von {max}', es: 'Nivel de precio {level} de {max}', it: 'Fascia di prezzo {level} su {max}', ja: '価格帯 {max}段階中{level}', ko: '가격대 {max}단계 중 {level}', pt: 'Faixa de preço {level} de {max}', ru: 'Уровень цен: {level} из {max}', zh: '价格等级 {level}/{max}' },
    cardsPlacePhoto: { en: 'Photo of {name}', fr: 'Photo de {name}', de: 'Foto von {name}', es: 'Foto de {name}', it: 'Foto di {name}', ja: '{name}の写真', ko: '{name} 사진', pt: 'Foto de {name}', ru: 'Фото: {name}', zh: '{name}的照片' },
} satisfies Record<string, CardWord>;

/** A kind's name, for the badge of a place whose tool gave only Google-style `types`. */
const KIND_WORDS: Record<Exclude<PlaceKind, 'place'>, CardWord> = {
    restaurant: { en: 'Restaurant', fr: 'Restaurant', de: 'Restaurant', es: 'Restaurante', it: 'Ristorante', ja: 'レストラン', ko: '음식점', pt: 'Restaurante', ru: 'Ресторан', zh: '餐厅' },
    cafe: { en: 'Café', fr: 'Café', de: 'Café', es: 'Cafetería', it: 'Caffè', ja: 'カフェ', ko: '카페', pt: 'Café', ru: 'Кафе', zh: '咖啡馆' },
    bar: { en: 'Bar', fr: 'Bar', de: 'Bar', es: 'Bar', it: 'Bar', ja: 'バー', ko: '바', pt: 'Bar', ru: 'Бар', zh: '酒吧' },
    hotel: { en: 'Hotel', fr: 'Hôtel', de: 'Hotel', es: 'Hotel', it: 'Hotel', ja: 'ホテル', ko: '호텔', pt: 'Hotel', ru: 'Отель', zh: '酒店' },
    shop: { en: 'Shop', fr: 'Boutique', de: 'Geschäft', es: 'Tienda', it: 'Negozio', ja: 'ショップ', ko: '상점', pt: 'Loja', ru: 'Магазин', zh: '商店' },
    museum: { en: 'Museum', fr: 'Musée', de: 'Museum', es: 'Museo', it: 'Museo', ja: '博物館', ko: '박물관', pt: 'Museu', ru: 'Музей', zh: '博物馆' },
    park: { en: 'Park', fr: 'Parc', de: 'Park', es: 'Parque', it: 'Parco', ja: '公園', ko: '공원', pt: 'Parque', ru: 'Парк', zh: '公园' },
    gym: { en: 'Gym', fr: 'Salle de sport', de: 'Fitnessstudio', es: 'Gimnasio', it: 'Palestra', ja: 'ジム', ko: '헬스장', pt: 'Academia', ru: 'Спортзал', zh: '健身房' },
    pharmacy: { en: 'Pharmacy', fr: 'Pharmacie', de: 'Apotheke', es: 'Farmacia', it: 'Farmacia', ja: '薬局', ko: '약국', pt: 'Farmácia', ru: 'Аптека', zh: '药店' },
};

/** The most places one card draws; a search that returns forty is a list, not a card. */
const MAX_PLACES = 10;
const MAX_TAGS = 4;
const PRICE_MAX = 4;
/** Within this many minutes of closing, "Open" turns to "Closes soon". */
const SOON = 60;
const DAY = 1440;
const WEEK = 7 * DAY;

// ── Reading ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function readDay(value: unknown): number | undefined {
    const n = num(value);
    if (n !== undefined) return Number.isInteger(n) && n >= 0 && n <= 7 ? n % 7 : undefined;
    if (typeof value !== 'string') return undefined;
    const i = DAY_NAMES.indexOf(value.trim().slice(0, 3).toLowerCase());
    return i >= 0 ? i : undefined;
}

/** Minutes from midnight: "09:00", "9:30", "0900", "21h30", "9 PM", Google's `{ hour, minute }`. */
export function readTime(value: unknown): number | undefined {
    if (value && typeof value === 'object') {
        const o = value as Record<string, unknown>;
        const h = num(o['hour']);
        const m = num(o['minute']) ?? 0;
        return h !== undefined && h >= 0 && h <= 24 && m >= 0 && m < 60 ? h * 60 + m : undefined;
    }
    const s = str(value);
    if (!s) return undefined;
    const match = /^(\d{1,2})(?:\s*[:h.]\s*)?(\d{2})?\s*(?:([ap])\.?\s*m\.?)?$/i.exec(s);
    if (!match) return undefined;
    let h = Number(match[1]);
    const m = match[2] ? Number(match[2]) : 0;
    const half = match[3]?.toLowerCase();
    if (m > 59) return undefined;
    if (half) {
        if (h < 1 || h > 12) return undefined;
        h = (h % 12) + (half === 'p' ? 12 : 0);
    }
    if (h > 24 || (h === 24 && m > 0)) return undefined;
    return h * 60 + m;
}

/** The ranges a day's text says: "09:00-12:00, 14:00-18:00", "9:00 AM – 5:00 PM", "Closed", "Open 24 hours". */
function rangesOfText(day: number, value: unknown): PlaceHoursRange[] {
    const parts = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\s*[,;]\s*/) : [];
    const out: PlaceHoursRange[] = [];
    for (const part of parts) {
        if (typeof part !== 'string') continue;
        const [from, to] = part.split(/\s*[-–—]\s*|\s+to\s+/i);
        // "Open 24 hours", "24h/24" — but not the end of a range: "18h-24h" closes at midnight.
        if (to === undefined && /24\s*(h|hours|heures|\/\s*24)/i.test(part)) {
            out.push({ day, start: 0, end: DAY });
            continue;
        }
        let end = readTime(to);
        const start = sharedMeridiem(from, to, end) ?? readTime(from);
        if (start === undefined || end === undefined) continue;
        if (end <= start) end += DAY;
        out.push({ day, start, end });
    }
    return out;
}

/**
 * The start of a range that writes AM/PM once, at its end — Google's "5:00 – 10:00 PM" is
 * five in the evening. The end's meridiem is lent to the start only when that keeps the
 * start before the end: "9:00 – 5:00 PM" stays nine in the morning.
 */
function sharedMeridiem(from: string | undefined, to: string | undefined, end: number | undefined): number | undefined {
    const MERIDIEM = /([ap])\.?\s*m\.?\s*$/i;
    const half = to !== undefined ? MERIDIEM.exec(to) : null;
    if (!from || !half || end === undefined || /[ap]\.?\s*m\.?\s*$/i.test(from)) return undefined;
    const start = readTime(`${from} ${half[1]}M`);
    return start !== undefined && start < end ? start : undefined;
}

/**
 * A range longer than a day — open from Friday evening to Sunday night, or around the clock
 * (Google writes that as one period with no close) — split at each midnight, so the week's
 * table shows every day it covers instead of the day it started.
 */
function splitLong(range: PlaceHoursRange): PlaceHoursRange[] {
    if (range.end - range.start <= DAY) return [range];
    const out: PlaceHoursRange[] = [];
    let at = range.day * DAY + range.start;
    const stop = Math.min(range.day * DAY + range.end, range.day * DAY + range.start + WEEK);
    while (at < stop) {
        const midnight = (Math.floor(at / DAY) + 1) * DAY;
        const end = Math.min(stop, midnight);
        out.push({ day: Math.floor(at / DAY) % 7, start: at % DAY, end: end - Math.floor(at / DAY) * DAY });
        at = end;
    }
    return out;
}

/**
 * The week's opening hours from the shapes tools write them in: `[{ day, open, close }]`,
 * Google's `periods` (`{ open: { day, time | hour, minute }, close }`), its `weekday_text`
 * ("Monday: 9:00 AM – 5:00 PM"), or a week by name (`{ monday: "09:00-18:00" }`).
 * Anything it cannot read is left out.
 */
export function readHours(raw: unknown): PlaceHoursRange[] {
    if (!raw || typeof raw !== 'object') return [];
    if (!Array.isArray(raw)) {
        const o = raw as Record<string, unknown>;
        for (const key of ['periods', 'weekday_text', 'weekdayDescriptions']) {
            if (Array.isArray(o[key])) return readHours(o[key]);
        }
        const out: PlaceHoursRange[] = [];
        for (const [key, value] of Object.entries(o)) {
            if (!/^[a-z]+$/i.test(key)) continue;
            const day = readDay(key);
            if (day !== undefined) out.push(...rangesOfText(day, value));
        }
        return tidy(out);
    }
    const yelp = raw.filter((item): item is Loose => !!item && typeof item === 'object' && Array.isArray((item as Loose)['open']));
    if (yelp.length) return tidy(yelpRanges(yelp));
    const out: PlaceHoursRange[] = [];
    for (const item of raw) {
        if (typeof item === 'string') {
            const line = /^\s*([A-Za-z]+)\s*:\s*(.+)$/.exec(item);
            const day = line ? readDay(line[1]) : undefined;
            if (line && day !== undefined) out.push(...rangesOfText(day, line[2]));
            continue;
        }
        if (!item || typeof item !== 'object') continue;
        const r = item as Record<string, unknown>;
        if (typeof r['start'] === 'number' && typeof r['end'] === 'number') {
            // Already read.
            const day = readDay(r['day']);
            if (day !== undefined && r['end'] > r['start']) out.push({ day, start: r['start'], end: r['end'] });
            continue;
        }
        if (r['open'] && typeof r['open'] === 'object') {
            // Google's period: the opening and the closing each carry their own day.
            const o = r['open'] as Record<string, unknown>;
            const day = readDay(o['day']);
            const start = readTime(o['time'] ?? o);
            if (day === undefined || start === undefined) continue;
            const c = r['close'];
            if (!c || typeof c !== 'object') {
                // Google's documented "always open" is one period, Sunday 00:00, with no close.
                // A missing close anywhere else is not documented: read it as midnight, as the
                // plain `{ day, open }` shape does, rather than as the whole week.
                out.push({ day, start, end: day === 0 && start === 0 ? WEEK : DAY });
                continue;
            }
            const cDay = readDay((c as Record<string, unknown>)['day']);
            const cTime = readTime((c as Record<string, unknown>)['time'] ?? c);
            if (cDay === undefined || cTime === undefined) continue;
            let end = ((cDay - day + 7) % 7) * DAY + cTime;
            if (end <= start) end += WEEK;
            out.push({ day, start, end });
            continue;
        }
        const day = readDay(r['day'] ?? r['weekday']);
        const start = readTime(r['open'] ?? r['opens'] ?? r['from']);
        if (day === undefined || start === undefined) continue;
        const close = r['close'] ?? r['closes'] ?? r['to'];
        let end = close === undefined || close === null || close === '' ? DAY : readTime(close);
        if (end === undefined) continue;
        if (end <= start) end += DAY;
        out.push({ day, start, end });
    }
    return tidy(out);
}

/**
 * Yelp Fusion's `hours`: `[{ hour_type, is_open_now, open: [{ day, start, end, is_overnight }] }]`,
 * where `day` 0 is MONDAY and the times are "HHMM" ("0700", "2130"). Only the regular week:
 * another `hour_type` (special hours) would mix into it.
 */
function yelpRanges(entries: Loose[]): PlaceHoursRange[] {
    const regular = entries.filter((e) => !str(e['hour_type']) || /regular/i.test(String(e['hour_type'])));
    const out: PlaceHoursRange[] = [];
    for (const entry of regular.length ? regular : entries.slice(0, 1)) {
        for (const range of entry['open'] as unknown[]) {
            const r = (range ?? {}) as Loose;
            const n = num(r['day']);
            const hhmm = (v: unknown) => readTime(str(v)?.padStart(4, '0'));
            const start = hhmm(r['start']);
            let end = hhmm(r['end']);
            if (n === undefined || !Number.isInteger(n) || n < 0 || n > 6 || start === undefined || end === undefined) continue;
            // `is_overnight`: the end is on the next day, which an end before the start says too.
            if (end <= start) end += DAY;
            out.push({ day: (n + 1) % 7, start, end });
        }
    }
    return out;
}

function tidy(ranges: PlaceHoursRange[]): PlaceHoursRange[] {
    return ranges.flatMap(splitLong).sort((a, b) => a.day - b.day || a.start - b.start);
}

/** The week's open spans in minutes from Sunday 00:00, repeated a week either side and merged. */
function spans(ranges: PlaceHoursRange[]): Array<[number, number]> {
    const list: Array<[number, number]> = [];
    for (const r of ranges) {
        for (const shift of [-WEEK, 0, WEEK]) list.push([r.day * DAY + r.start + shift, r.day * DAY + r.end + shift]);
    }
    list.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const span of list) {
        const last = merged[merged.length - 1];
        // Touching spans are one: open 09:00–12:00 and 12:00–14:00 closes at 14:00.
        if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
        else merged.push([span[0], span[1]]);
    }
    return merged;
}

/**
 * Whether a place with these hours is open at `date`, and when that changes — read on
 * `date`'s own clock (pass the place's local time). `null` when the hours say nothing.
 * Hours take any shape `readHours` reads.
 */
export function placeStatus(hours: unknown, date: Date): PlaceStatus | null {
    const ranges = readHours(hours);
    if (!ranges.length) return null;
    const t = date.getDay() * DAY + date.getHours() * 60 + date.getMinutes();
    // A minute of the week as a time on `date`'s clock, built from its fields rather than
    // added to it: a daylight-saving change in between would move "04:00" to 03:00.
    const at = (minute: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay() + Math.floor(minute / DAY), 0, minute % DAY);
    const list = spans(ranges);
    const inside = list.find(([s, e]) => s <= t && t < e);
    if (inside) return inside[1] - inside[0] >= WEEK ? { open: true } : { open: true, changesAt: at(inside[1]) };
    const next = list.find(([s]) => s > t);
    return next ? { open: false, changesAt: at(next[0]) } : { open: false };
}

/** Whether a place with these hours is open at `date`. No hours, no answer: `false`. */
export function isOpenAt(hours: unknown, date: Date): boolean {
    return placeStatus(hours, date)?.open ?? false;
}

/**
 * `date` moved to the place's wall clock, when its UTC offset is known: the place's time,
 * read off the UTC fields of the shifted instant, written into a Date's local fields (which
 * is how `placeStatus` reads a clock). Adding the reader's `getTimezoneOffset()` instead is
 * an hour wrong whenever the reader's own zone changes its clocks in between.
 */
function placeTime(place: Pick<Place, 'utcOffset'>, now: Date): Date {
    if (place.utcOffset === undefined) return now;
    const t = new Date(now.getTime() + place.utcOffset * 60_000);
    return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds(), t.getUTCMilliseconds());
}

const KIND_RULES: Array<[Exclude<PlaceKind, 'place'>, RegExp]> = [
    ['cafe', /\bcaf[eé]s?\b|coffee|tea ?room|bakery|boulangerie|p[aâ]tisserie|salon de th[eé]/],
    ['bar', /\bbars?\b|\bpubs?\b|brewery|\bwine\b|cocktail|night ?club/],
    ['restaurant', /restaurant|\bfood\b|meal|pizz|sushi|burger|bistro|brasserie|diner|eatery|trattoria|ramen|steak|cr[eê]perie/],
    ['hotel', /h[oô]tel|lodging|hostel|motel|\binn\b|resort|guest ?house|bed and breakfast|\bb ?& ?b\b/],
    ['museum', /museum|mus[eé]e|galler|monument|landmark|tourist attraction|\bart\b/],
    ['park', /\bparks?\b|\bparcs?\b|garden|jardin|beach|plage|\bzoo\b|campground/],
    ['gym', /\bgyms?\b|fitness|stadium|swimming|piscine/],
    ['pharmacy', /pharmac|drugstore|chemist/],
    ['shop', /shop|store|boutique|market|\bmall\b|grocery|supermarch|magasin|[eé]picerie/],
];

/** The kind of place, from its category, then its types in order — the first one that says. */
function readKind(candidates: unknown[]): PlaceKind {
    for (const candidate of candidates) {
        const text = str(candidate)?.toLowerCase().replace(/[_-]+/g, ' ');
        if (!text) continue;
        for (const [kind, rule] of KIND_RULES) if (rule.test(text)) return kind;
    }
    return 'place';
}

const PRICE_WORDS: Record<string, number> = {
    inexpensive: 1, cheap: 1, moderate: 2, expensive: 3, very_expensive: 4, 'very expensive': 4,
};

function readPrice(value: unknown): { price?: PlacePrice; priceText?: string } {
    const n = num(value);
    if (n !== undefined) return n >= 1 && n <= PRICE_MAX ? { price: { level: Math.round(n) } } : {};
    const s = str(value);
    if (!s) return {};
    const repeated = /^(\p{Sc})\1{0,3}$/u.exec(s);
    if (repeated) return { price: { level: s.length / repeated[1]!.length, symbol: repeated[1] } };
    const named = PRICE_WORDS[s.toLowerCase().replace(/^price_level_/, '')];
    if (named) return { price: { level: named } };
    if (/^price_level_/i.test(s)) return {};
    return s.length <= 24 ? { priceText: s } : {};
}

function readCoordinates(r: Loose): Place['coordinates'] {
    const candidates = [r['coordinates'], r['geometry']?.['location'], r['location'], r['position'], r['latlng'], r];
    for (const c of candidates) {
        if (!c || typeof c !== 'object') continue;
        const lat = num(c['lat'] ?? c['latitude']);
        const lng = num(c['lng'] ?? c['lon'] ?? c['long'] ?? c['longitude']);
        if (lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
    return undefined;
}

/**
 * A link a place's data gives — absolute `http(s)` only. A bare domain ("trattoria.fr") is read
 * as `https://` where asked. A path (`/img/a.jpg`) is refused, as the kit's `webUrl` refuses it:
 * it comes from a tool, and a photo's address is fetched on render, with the app's cookies.
 */
function webUrl(value: unknown, guessScheme = false): string | undefined {
    let s = str(value);
    if (!s) return undefined;
    if (s.startsWith('//')) {
        s = `https:${s}`;
    } else if (!/^https?:\/\//i.test(s)) {
        // Not a link — Google's photo names ("places/…/photos/…") are not addresses a browser
        // can load, and a path on this site is not the tool's to ask for.
        if (!guessScheme || !/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) return undefined;
        s = `https://${s}`;
    }
    const url = safeUrl(s);
    return url && /^https?:/i.test(url) ? url : undefined;
}

function textOf(value: unknown): string | undefined {
    if (value && typeof value === 'object') {
        const o = value as Record<string, unknown>;
        return str(o['text'] ?? o['title'] ?? o['name'] ?? o['url']);
    }
    return str(value);
}

/** A link given as a string or as `{ url | src | href | uri }`. */
function linkOf(value: unknown): string | undefined {
    if (value && typeof value === 'object') {
        const o = value as Record<string, unknown>;
        return str(o['url'] ?? o['src'] ?? o['href'] ?? o['uri']);
    }
    return str(value);
}

function firstOf(value: unknown): unknown {
    return Array.isArray(value) ? value[0] : value;
}

function readPlace(raw: unknown): Place | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Loose;
    const name = textOf(r['name'] ?? r['displayName'] ?? r['title']);
    if (!name) return null;
    const category = textOf(r['category'] ?? r['primaryTypeDisplayName'] ?? firstOf(r['categories']));
    const types = Array.isArray(r['types']) ? r['types'] : [];
    let ratingValue = num(r['rating'] ?? r['stars']);
    if (ratingValue !== undefined && ratingValue > 5 && ratingValue <= 10) ratingValue /= 2;
    if (ratingValue !== undefined && (ratingValue < 0 || ratingValue > 5)) ratingValue = undefined;
    const reviewCount = num(r['reviewCount'] ?? r['review_count'] ?? r['user_ratings_total'] ?? r['userRatingCount'] ?? r['ratingCount'] ?? r['rating_count'] ?? r['reviews']);
    const rawDistance = r['distance'] ?? r['distanceMeters'] ?? r['distance_meters'] ?? r['distance_m'];
    const distance = num(rawDistance);
    // Google's current hours first: the next seven days, holidays included, where the regular
    // week would call a closed bank holiday open. The first source with a week gives the week;
    // the first with an answer gives "open now" (Yelp's sits on its first `hours` entry).
    const hourSources: Loose[] = [r['hours'], r['currentOpeningHours'], r['current_opening_hours'], r['regularOpeningHours'], r['opening_hours'], r['openingHours']]
        .filter((h) => h && typeof h === 'object');
    let hours: PlaceHoursRange[] = [];
    for (const source of hourSources) {
        hours = readHours(source);
        if (hours.length) break;
    }
    const openSource = r['openNow'] ?? r['open_now'] ?? r['isOpen'] ?? r['is_open'] ?? r['is_open_now']
        ?? hourSources.map((h) => (Array.isArray(h) ? h[0] : h) as Loose | undefined)
            .map((h) => h?.['openNow'] ?? h?.['open_now'] ?? h?.['is_open_now'])
            .find((v) => typeof v === 'boolean');
    const tags = (Array.isArray(r['tags']) ? r['tags'] : Array.isArray(r['features']) ? r['features'] : Array.isArray(r['amenities']) ? r['amenities'] : [])
        .map(textOf)
        .filter((t: string | undefined): t is string => !!t && t.length <= 32)
        .slice(0, MAX_TAGS);
    const utcOffset = num(r['utcOffset'] ?? r['utc_offset_minutes'] ?? r['utcOffsetMinutes'] ?? r['utc_offset']);
    return {
        name,
        category,
        kind: readKind([category, r['primaryType'], ...types]),
        image: webUrl(linkOf(r['image'] ?? r['photo'] ?? r['imageUrl'] ?? r['image_url'] ?? r['photoUrl'] ?? r['thumbnail'] ?? r['picture'] ?? firstOf(r['photos']))),
        rating: ratingValue,
        reviewCount: reviewCount !== undefined && reviewCount >= 0 ? Math.round(reviewCount) : undefined,
        ...readPrice(r['priceLevel'] ?? r['price_level'] ?? r['price']),
        address: str(r['address'] ?? r['formatted_address'] ?? r['formattedAddress'] ?? r['shortFormattedAddress'] ?? r['vicinity'] ?? (typeof r['location'] === 'string' ? r['location'] : undefined))
            // Yelp's address is lines to stack: on one line, they are joined.
            ?? (Array.isArray(r['location']?.['display_address']) ? str(r['location']['display_address'].map(str).filter(Boolean).join(', ')) : undefined),
        distance: distance !== undefined && distance >= 0 ? distance : undefined,
        distanceText: distance === undefined && typeof rawDistance === 'string' ? str(rawDistance) : undefined,
        phone: str(r['phone'] ?? r['phoneNumber'] ?? r['phone_number'] ?? r['formatted_phone_number'] ?? r['nationalPhoneNumber'] ?? r['international_phone_number'] ?? r['internationalPhoneNumber'] ?? r['tel']),
        website: webUrl(r['website'] ?? r['websiteUri'] ?? r['websiteUrl'] ?? r['site'], true),
        url: webUrl(r['url'] ?? r['googleMapsUri'] ?? r['mapsUrl'] ?? r['maps_url'] ?? r['link']),
        coordinates: readCoordinates(r),
        placeId: str(r['placeId'] ?? r['place_id'] ?? r['googlePlaceId']),
        openNow: typeof openSource === 'boolean' ? openSource : undefined,
        hours,
        utcOffset: utcOffset !== undefined && Math.abs(utcOffset) <= 14 * 60 ? utcOffset : undefined,
        tags,
    };
}

/**
 * The card's data from what `map` returns: one place, an array of places, or a collection
 * (`{ title?, places | results | candidates }`). At most ten places; `null` when not one
 * has a name.
 */
export function readPlaces(raw: unknown): PlaceData | null {
    if (!raw || typeof raw !== 'object') return null;
    let title: string | undefined;
    let list: unknown[];
    if (Array.isArray(raw)) {
        list = raw;
    } else {
        const r = raw as Record<string, unknown>;
        const nested = r['places'] ?? r['results'] ?? r['candidates'];
        if (Array.isArray(nested)) {
            list = nested;
            title = str(r['title']);
        } else {
            list = [raw];
        }
    }
    const places = list.map(readPlace).filter((p): p is Place => p !== null).slice(0, MAX_PLACES);
    return places.length ? { ...(title ? { title } : {}), places } : null;
}

/**
 * Google Maps directions to the place: to its coordinates when known, else to its name and
 * address, landing on the place itself when its Google id is known. `null` without either.
 */
export function directionsUrl(place: Pick<Place, 'name' | 'address' | 'coordinates' | 'placeId'>): string | null {
    const destination = place.coordinates
        ? `${place.coordinates.lat},${place.coordinates.lng}`
        : place.address ? `${place.name}, ${place.address}` : null;
    if (!destination) return null;
    const id = place.placeId ? `&destination_place_id=${encodeURIComponent(place.placeId)}` : ''; // safe-attr: a URL query parameter, encodeURIComponent-ed, not markup
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${id}`; // safe-attr: a URL query parameter, encodeURIComponent-ed, not markup
}

/**
 * A `tel:` link from a written number — its digits, and the `+` before the first of them
 * ("Tel: +33 …" keeps it). An extension ("ext. 12", "x12", "#3") is not part of the number:
 * dialled as digits, it would make a different one. `null` for no number.
 */
export function phoneUrl(phone: string | undefined): string | null {
    if (!phone) return null;
    const number = phone.replace(/\s*(?:\b(?:ext(?:ension)?\.?|x)\s*\d|#).*$/i, '');
    const digits = number.replace(/\D/g, '');
    const plus = /^[^\d]*\+/.test(number) ? '+' : '';
    return /\d{3,}/.test(digits) ? safeUrl(`tel:${plus}${digits}`) : null;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

interface Settings {
    builtIns: boolean;
    currencySymbol: string;
    now: () => Date;
    map?: { tiles: string; attribution?: string; zoom: number };
}

type Tone = 'open' | 'soon' | 'closed';

/** What the status line says, worked out once at render, so a language switch re-words it without re-reading the clock. */
interface StatusView {
    tone: Tone;
    state: keyof typeof P;
    next?: (config: AparteConfig) => string;
}

/**
 * A time of day as the language writes it on a shop door: "10 PM" where the clock has
 * twelve hours, "22:00" where it has twenty-four — `formatHour` would write a bare "22",
 * which reads as a number, not a time.
 */
function clock(config: AparteConfig, date: Date): string {
    const tag = intlTag(config);
    const twelve = /h1[12]/.test(new Intl.DateTimeFormat(tag, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '');
    return twelve
        ? new Intl.DateTimeFormat(tag, { hour: 'numeric', minute: date.getMinutes() ? '2-digit' : undefined }).format(date)
        : new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit' }).format(date);
}
const weekday = (config: AparteConfig, date: Date) => new Intl.DateTimeFormat(intlTag(config), { weekday: 'long' }).format(date);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);

function statusView(place: Place, now: Date): StatusView | null {
    const local = placeTime(place, now);
    const status = place.hours.length ? placeStatus(place.hours, local) : null;
    if (!status) {
        if (place.openNow === undefined) return null;
        return { tone: place.openNow ? 'open' : 'closed', state: place.openNow ? 'cardsPlaceOpen' : 'cardsPlaceClosed' };
    }
    const at = status.changesAt;
    if (status.open) {
        if (!at) return { tone: 'open', state: 'cardsPlaceAlwaysOpen' };
        const minutes = (at.getTime() - local.getTime()) / 60_000;
        if (minutes < SOON) return { tone: 'soon', state: 'cardsPlaceClosesSoon', next: (c) => clock(c, at) };
        return {
            tone: 'open',
            state: 'cardsPlaceOpen',
            // Past midnight is still "closes at 02:00"; only a close more than a day away names its day.
            next: minutes <= DAY
                ? (c) => word(c, 'cardsPlaceClosesAt', P.cardsPlaceClosesAt, { t: clock(c, at) })
                : (c) => word(c, 'cardsPlaceClosesOn', P.cardsPlaceClosesOn, { day: weekday(c, at), t: clock(c, at) }),
        };
    }
    if (!at) return { tone: 'closed', state: 'cardsPlaceClosed' };
    const days = daysBetween(local, at);
    return {
        tone: 'closed',
        state: 'cardsPlaceClosed',
        next: days === 0
            ? (c) => word(c, 'cardsPlaceOpensAt', P.cardsPlaceOpensAt, { t: clock(c, at) })
            : days === 1
                ? (c) => word(c, 'cardsPlaceOpensTomorrow', P.cardsPlaceOpensTomorrow, { t: clock(c, at) })
                : (c) => word(c, 'cardsPlaceOpensOn', P.cardsPlaceOpensOn, { day: weekday(c, at), t: clock(c, at) }),
    };
}

function distanceText(config: AparteConfig, metres: number): string {
    if (metres < 1000) return formatUnit(config, metres < 100 ? Math.round(metres) : Math.round(metres / 10) * 10, 'meter');
    const km = metres / 1000;
    return formatUnit(config, km, 'kilometer', km < 10 ? 1 : 0);
}

/** The middle dot between two facts on a line — drawn, not read. */
const dot = () => el('span', { class: 'aparte-place__dot', attrs: { 'aria-hidden': 'true' }, text: '·' });

function joined(className: string, parts: Array<Node | null>, tag: 'div' | 'p' = 'div'): HTMLElement | null {
    const present = parts.filter((p): p is Node => p !== null);
    if (!present.length) return null;
    const line = el(tag, { class: className });
    present.forEach((part, i) => {
        if (i) line.append(dot());
        line.append(part);
    });
    return line;
}

function nameOf(place: Place, className = 'aparte-place__name'): HTMLElement {
    const name = el('div', { class: className });
    if (place.url) {
        name.append(el('a', { class: 'aparte-place__link', attrs: { href: place.url, target: '_blank', rel: 'noopener noreferrer' }, text: place.name }));
    } else {
        name.textContent = place.name;
    }
    return name;
}

/** The category as the tool wrote it, else the kind's name in the chat's language, else nothing. */
function categoryOf(ctx: CardContext, place: Place): HTMLElement | null {
    if (place.category) return el('span', { class: 'aparte-place__category', text: place.category });
    if (place.kind === 'place') return null;
    const node = el('span', { class: 'aparte-place__category' });
    ctx.word(node, `cardsPlace_${place.kind}`, KIND_WORDS[place.kind]);
    return node;
}

function priceOf(ctx: CardContext, place: Place, settings: Settings): HTMLElement | null {
    if (place.priceText) return el('span', { class: 'aparte-place__price', text: place.priceText });
    if (!place.price) return null;
    const { level } = place.price;
    const sign = place.price.symbol ?? settings.currencySymbol;
    // The tier in full ink, the rest of the scale faint: "€€" reads as two of four.
    const node = el('span', { class: 'aparte-place__price', attrs: { role: 'img' } },
        el('span', { class: 'aparte-place__price-on', attrs: { 'aria-hidden': 'true' }, text: sign.repeat(level) }),
        level < PRICE_MAX ? el('span', { class: 'aparte-place__price-off', attrs: { 'aria-hidden': 'true' }, text: sign.repeat(PRICE_MAX - level) }) : null);
    ctx.bind(node, () => word(ctx.config, 'cardsPlacePrice', P.cardsPlacePrice, {
        level: formatNumber(ctx.config, level), max: formatNumber(ctx.config, PRICE_MAX),
    }), 'aria-label');
    return node;
}

function scoreOf(ctx: CardContext, place: Place, settings: Settings): HTMLElement | null {
    return joined('aparte-place__score', [rating(ctx, place.rating, { count: place.reviewCount }), priceOf(ctx, place, settings)]);
}

function distanceOf(ctx: CardContext, place: Place): HTMLElement | null {
    if (place.distance !== undefined) {
        const node = el('span', { class: 'aparte-place__distance' });
        ctx.bind(node, () => distanceText(ctx.config, place.distance!));
        return node;
    }
    return place.distanceText ? el('span', { class: 'aparte-place__distance', text: place.distanceText }) : null;
}

/** "● Open · Closes at 22:00" — the state is a word, so it does not rest on its colour. */
function statusOf(ctx: CardContext, place: Place, now: Date): HTMLElement | null {
    const view = statusView(place, now);
    if (!view) return null;
    const line = el('p', { class: 'aparte-place__status', attrs: { 'data-status': view.tone } });
    const state = el('span', { class: 'aparte-place__state' });
    ctx.word(state, view.state, P[view.state]);
    line.append(el('span', { class: 'aparte-place__status-dot', attrs: { 'aria-hidden': 'true' } }), state);
    if (view.next) {
        const next = el('span', { class: 'aparte-place__next' });
        ctx.bind(next, () => view.next!(ctx.config));
        line.append(dot(), next);
    }
    return line;
}

function addressOf(ctx: CardContext, place: Place): HTMLElement | null {
    const distance = distanceOf(ctx, place);
    const address = place.address ? el('span', { class: 'aparte-place__address-text', text: place.address }) : null;
    const line = joined('aparte-place__address', [distance, address], 'p');
    if (line) line.prepend(glyph(PIN, 'aparte-rich-card__glyph aparte-place__line-glyph'));
    return line;
}

/**
 * The photo in a fixed box, over a placeholder that stays behind it: a soft map with the
 * kind's marker for a wide box, the kind's glyph for a thumbnail. A photo that fails to load
 * is removed, and the placeholder is what shows.
 */
function mediaOf(ctx: CardContext, place: Place, size: 'wide' | 'thumb', settings?: Settings): HTMLElement {
    const box = el('div', { class: `aparte-place__media aparte-place__media--${size}` });
    const mark = glyph(kindGlyph(place.kind), 'aparte-rich-card__glyph aparte-place__marker-glyph');
    box.append(el('span', { class: 'aparte-place__placeholder', attrs: { 'aria-hidden': 'true' } },
        el('span', { class: 'aparte-place__marker' }, mark)));
    // The app's tiles, when it gave some: under the marker, for a place with coordinates and no photo.
    const map = size === 'wide' && !place.image && place.coordinates && settings?.map ? mapOf(place.coordinates, settings.map) : null;
    if (map) {
        box.setAttribute('data-map', '');
        box.prepend(map.layer);
        if (map.credit) box.append(map.credit);
        // One tile missing would leave a hole in the street: the drawn map comes back whole.
        for (const tile of map.layer.querySelectorAll('img')) {
            tile.addEventListener('error', () => {
                map.layer.remove();
                map.credit?.remove();
                box.removeAttribute('data-map');
            }, { once: true });
        }
    }
    if (place.image) {
        // No referrer: the photo is on someone else's server, which need not learn the chat's address.
        const img = el('img', { class: 'aparte-place__img', attrs: { src: place.image, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' } });
        ctx.bind(img, () => word(ctx.config, 'cardsPlacePhoto', P.cardsPlacePhoto, { name: place.name }), 'alt');
        img.addEventListener('error', () => {
            img.remove();
            box.setAttribute('data-empty', '');
        }, { once: true });
        box.append(img);
    } else {
        box.setAttribute('data-empty', '');
    }
    return box;
}

const TILE = 256;

/**
 * Nine tiles around a point, placed so the point sits under the marker's tip. Web
 * Mercator, as every tile server cuts its tiles: the point's position in tiles at `zoom`,
 * the tile it falls in, and where in that tile. Laid out in physical pixels — a map is
 * not text, and a right-to-left page does not mirror it.
 */
function mapOf(at: { lat: number; lng: number }, map: NonNullable<Settings['map']>): { layer: HTMLElement; credit: HTMLElement | null } | null {
    const lat = Math.max(-85.05, Math.min(85.05, at.lat)) * Math.PI / 180;
    const n = 2 ** map.zoom;
    const fx = ((at.lng + 180) / 360) * n;
    const fy = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n;
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const layer = el('span', { class: 'aparte-place__map', attrs: { 'aria-hidden': 'true' } });
    layer.style.setProperty('--aparte-place-map-x', `${Math.round(TILE + (fx - tx) * TILE)}px`);
    layer.style.setProperty('--aparte-place-map-y', `${Math.round(TILE + (fy - ty) * TILE)}px`);
    for (let row = -1; row <= 1; row++) {
        for (let col = -1; col <= 1; col++) {
            const y = ty + row;
            const x = (((tx + col) % n) + n) % n; // the world wraps east and west, not north and south
            const tile = el('img', { class: 'aparte-place__tile', attrs: { alt: '', draggable: 'false', loading: 'lazy', decoding: 'async' } });
            if (y >= 0 && y < n) tile.setAttribute('src', map.tiles.replace('{z}', String(map.zoom)).replace('{x}', String(x)).replace('{y}', String(y)));
            else tile.style.visibility = 'hidden';
            layer.append(tile);
        }
    }
    const credit = map.attribution ? el('span', { class: 'aparte-place__credit', text: map.attribution }) : null;
    return { layer, credit };
}

type ActionKind = 'directions' | 'call' | 'website';
const ACTION_WORD: Record<ActionKind, 'cardsPlaceDirections' | 'cardsPlaceCall' | 'cardsPlaceWebsite'> = {
    directions: 'cardsPlaceDirections', call: 'cardsPlaceCall', website: 'cardsPlaceWebsite',
};
const ACTION_GLYPH: Record<ActionKind, string> = { directions: DIRECTIONS, call: PHONE, website: GLOBE };

/**
 * The buttons a place's own data can honour — none it cannot. Labelled on a card on its own;
 * round and icon-only on a tile in a row, where three words do not fit (the word is then the
 * button's name and its tooltip).
 */
function actionsOf(ctx: CardContext, place: Place, settings: Settings, iconOnly: boolean): HTMLElement | null {
    if (!settings.builtIns) return null;
    const urls: Array<[ActionKind, string | null | undefined]> = [
        ['directions', directionsUrl(place)],
        ['call', phoneUrl(place.phone)],
        ['website', place.website ?? place.url],
    ];
    const buttons: HTMLButtonElement[] = [];
    for (const [kind, url] of urls) {
        if (!url) continue;
        const label = () => word(ctx.config, ACTION_WORD[kind], P[ACTION_WORD[kind]]);
        const primary = kind === 'directions' && !iconOnly;
        const button = ctx.action({ id: kind, label: label(), url, primary }, place,
            `aparte-place__action${iconOnly ? ' aparte-btn--icon aparte-btn--circle' : ''}`)!;
        // The kit writes the label as plain text; the place's buttons carry a glyph, and a
        // word that follows the language.
        button.textContent = '';
        button.setAttribute('data-action', kind);
        button.append(glyph(ACTION_GLYPH[kind], 'aparte-rich-card__glyph aparte-btn__icon'));
        if (iconOnly) {
            ctx.bind(button, label, 'aria-label');
            ctx.bind(button, label, 'title');
        } else {
            const text = el('span');
            ctx.bind(text, label);
            button.append(text);
        }
        buttons.push(button);
    }
    return buttons.length ? el('div', { class: 'aparte-place__actions' }, ...buttons) : null;
}

/** A place as a tile: photo, name, rating, open status, address, buttons. */
function tileOf(ctx: CardContext, place: Place, settings: Settings, now: Date, inRow: boolean): HTMLElement {
    const media = mediaOf(ctx, place, 'wide', settings);
    const category = categoryOf(ctx, place);
    if (category) {
        media.append(el('span', { class: 'aparte-place__badge' },
            glyph(kindGlyph(place.kind), 'aparte-rich-card__glyph aparte-place__badge-glyph'), category));
    }
    const body = el('div', { class: 'aparte-place__body' }, nameOf(place), scoreOf(ctx, place, settings), statusOf(ctx, place, now), addressOf(ctx, place));
    const actions = actionsOf(ctx, place, settings, inRow);
    if (actions) body.append(actions);
    return el('article', { class: `aparte-place${inRow ? ' aparte-place--tile' : ''}`, attrs: { 'data-kind': place.kind } }, media, body);
}

/** A place as one row: thumbnail, name and distance, rating, open status. */
function rowOf(ctx: CardContext, place: Place, settings: Settings, now: Date, tag: 'div' | 'li'): HTMLElement {
    const head = el('div', { class: 'aparte-place__row-head' }, nameOf(place), distanceOf(ctx, place));
    const facts = joined('aparte-place__score', [
        rating(ctx, place.rating, { count: place.reviewCount }),
        priceOf(ctx, place, settings),
        categoryOf(ctx, place),
    ]);
    const text = el('div', { class: 'aparte-place__text' }, head, facts, statusOf(ctx, place, now));
    return el(tag, { class: 'aparte-place aparte-place__row', attrs: { 'data-kind': place.kind } }, mediaOf(ctx, place, 'thumb'), text);
}

function rangeText(config: AparteConfig, range: PlaceHoursRange): string {
    if (range.start === 0 && range.end >= DAY) return word(config, 'cardsPlaceAlwaysOpen', P.cardsPlaceAlwaysOpen);
    const at = (minute: number) => clock(config, new Date(2000, 0, 1, Math.floor(minute / 60) % 24, minute % 60));
    return `${at(range.start)}–${at(range.end)}`;
}

/** The week, from today, today marked: a table, so each day is read with its hours. */
function hoursOf(ctx: CardContext, place: Place, now: Date): HTMLElement | null {
    if (!place.hours.length) return null;
    const local = placeTime(place, now);
    const caption = el('caption', { class: 'aparte-place__hours-title' });
    const title = el('span');
    ctx.word(title, 'cardsPlaceHours', P.cardsPlaceHours);
    caption.append(glyph(CLOCK, 'aparte-rich-card__glyph aparte-place__line-glyph'), title);
    const body = el('tbody');
    for (let i = 0; i < 7; i++) {
        const date = new Date(local.getFullYear(), local.getMonth(), local.getDate() + i, 12);
        const ranges = place.hours.filter((r) => r.day === date.getDay());
        const day = el('th', { attrs: { scope: 'row' } });
        ctx.bind(day, () => weekday(ctx.config, date));
        const hours = el('td');
        ctx.bind(hours, () => (ranges.length
            ? ranges.map((r) => rangeText(ctx.config, r)).join(', ')
            : word(ctx.config, 'cardsPlaceClosed', P.cardsPlaceClosed)));
        body.append(el('tr', { attrs: { 'aria-current': i === 0 ? 'date' : undefined, 'data-closed': !ranges.length } }, day, hours));
    }
    return el('table', { class: 'aparte-place__hours' }, caption, body);
}

/** The place's ways in, one a line: where it is, its number, its site. */
function infoOf(ctx: CardContext, place: Place): HTMLElement | null {
    const items: HTMLElement[] = [];
    const address = addressOf(ctx, place);
    if (address) items.push(el('li', {}, ...address.childNodes));
    const tel = phoneUrl(place.phone);
    if (place.phone) {
        items.push(el('li', {}, glyph(PHONE, 'aparte-rich-card__glyph aparte-place__line-glyph'),
            tel ? el('a', { class: 'aparte-place__link', attrs: { href: tel }, text: place.phone }) : place.phone));
    }
    if (place.website) {
        const host = new URL(place.website).hostname.replace(/^www\./, '');
        items.push(el('li', {}, glyph(GLOBE, 'aparte-rich-card__glyph aparte-place__line-glyph'),
            el('a', { class: 'aparte-place__link', attrs: { href: place.website, target: '_blank', rel: 'noopener noreferrer' }, text: host })));
    }
    return items.length ? el('ul', { class: 'aparte-place__info' }, ...items) : null;
}

function tagsOf(place: Place): HTMLElement | null {
    if (!place.tags.length) return null;
    return el('ul', { class: 'aparte-place__tags' }, ...place.tags.map((t) =>
        el('li', { class: 'aparte-tag aparte-tag--sm aparte-place__tag' }, el('span', { class: 'aparte-tag__label', text: t }))));
}

function renderDetail(ctx: CardContext, place: Place, settings: Settings, now: Date): Node[] {
    const media = mediaOf(ctx, place, 'wide', settings);
    const category = categoryOf(ctx, place);
    if (category) {
        media.append(el('span', { class: 'aparte-place__badge' },
            glyph(kindGlyph(place.kind), 'aparte-rich-card__glyph aparte-place__badge-glyph'), category));
    }
    const head = el('div', { class: 'aparte-place__head' }, nameOf(place), scoreOf(ctx, place, settings), statusOf(ctx, place, now));
    const body = el('div', { class: 'aparte-place__body' }, head);
    for (const part of [actionsOf(ctx, place, settings, false), infoOf(ctx, place), hoursOf(ctx, place, now), tagsOf(place)]) {
        if (part) body.append(part);
    }
    return [el('article', { class: 'aparte-place aparte-place--detail', attrs: { 'data-kind': place.kind } }, media, body)];
}

function countLabel(ctx: CardContext, data: Partial<PlaceData>): string {
    return data.title ?? word(ctx.config, 'cardsPlaceCount', P.cardsPlaceCount, { n: formatNumber(ctx.config, data.places?.length ?? 0) });
}

function headingOf(ctx: CardContext, data: PlaceData): HTMLElement {
    const text = el('span', { class: 'aparte-place__heading-text' });
    ctx.bind(text, () => countLabel(ctx, data));
    return el('div', { class: 'aparte-place__heading' }, glyph(PIN, 'aparte-rich-card__glyph aparte-place__line-glyph'), text);
}

function render(data: PlaceData, ctx: CardContext<PlaceVariant>, settings: Settings): Node[] {
    const now = settings.now();
    const [first] = data.places as [Place];
    const many = data.places.length > 1;
    if (ctx.variant === 'compact') {
        if (!many) return [rowOf(ctx, first, settings, now, 'div')];
        const list = el('ul', { class: 'aparte-place__list' }, ...data.places.map((p) => rowOf(ctx, p, settings, now, 'li')));
        ctx.bind(list, () => countLabel(ctx, data), 'aria-label');
        return [headingOf(ctx, data), list];
    }
    if (many) {
        // `detail` is one place's page: several of them are tiles in a row, like `card`.
        const slides = data.places.map((p) => tileOf(ctx, p, settings, now, true));
        return [el('div', { class: 'aparte-place__collection' }, headingOf(ctx, data), carousel(ctx, slides, { label: () => countLabel(ctx, data) }))];
    }
    return ctx.variant === 'detail' ? renderDetail(ctx, first, settings, now) : [tileOf(ctx, first, settings, now, false)];
}

function skeleton(partial: Partial<PlaceData> | null, ctx: CardContext<PlaceVariant>): Node[] {
    const block = (cls: string, kind: 'text' | 'rect' = 'rect') =>
        el('span', { class: `aparte-skeleton aparte-skeleton--${kind} ${cls}`, attrs: { 'aria-hidden': 'true' } });
    const known = partial?.places?.[0]?.name ?? partial?.title;
    const name = known ? el('div', { class: 'aparte-place__name', text: known }) : block('aparte-place__sk-name', 'text');
    if (ctx.variant === 'compact') {
        return [el('div', { class: 'aparte-place aparte-place__row' }, block('aparte-place__media--thumb aparte-place__sk-thumb'),
            el('div', { class: 'aparte-place__text' }, name, block('aparte-place__sk-line', 'text')))];
    }
    const body = el('div', { class: 'aparte-place__body' }, name,
        block('aparte-place__sk-line', 'text'),
        block('aparte-place__sk-line aparte-place__sk-line--short', 'text'),
        el('div', { class: 'aparte-place__sk-actions' }, block('aparte-place__sk-btn'), block('aparte-place__sk-btn')));
    if (ctx.variant === 'detail') body.append(el('div', { class: 'aparte-place__sk-hours' }, ...Array.from({ length: 4 }, () => block('aparte-place__sk-line', 'text'))));
    return [el('article', { class: 'aparte-place' }, block('aparte-place__media--wide aparte-place__sk-media'), body)];
}

function label(data: Partial<PlaceData> | null, ctx: CardContext): string {
    const places = data?.places ?? [];
    if (places.length === 1) return places[0]!.name;
    if (places.length > 1 || data?.title) return countLabel(ctx, data!);
    return word(ctx.config, 'cardsPlaceTitle', P.cardsPlaceTitle);
}

/** One sentence a place: "Name — 4.6/5 (1,284), 12 rue de la Paix". */
function fallback(data: PlaceData, ctx: CardContext): string {
    const lines = data.places.map((p) => {
        const score = p.rating !== undefined
            ? `${formatNumber(ctx.config, p.rating, { maximumFractionDigits: 1 })}/5${p.reviewCount !== undefined ? ` (${formatNumber(ctx.config, p.reviewCount)})` : ''}`
            : undefined;
        const rest = [score, p.address].filter(Boolean).join(', ');
        return rest ? `${p.name} — ${rest}` : p.name;
    });
    return data.title ? `${data.title}:\n${lines.join('\n')}` : lines.join('\n');
}

function partial(input: Record<string, unknown>): Partial<PlaceData> | null {
    const name = str(input['name'] ?? input['place'] ?? input['placeName']);
    if (name) return { places: [readPlace({ name })!] };
    const query = str(input['query'] ?? input['q'] ?? input['keyword'] ?? input['search'] ?? input['textQuery']);
    return query ? { title: query } : null;
}

function createPlaceCard(settings: Settings) {
    return defineCard<PlaceData, PlaceVariant>({
        name: 'place',
        variants: ['card', 'compact', 'detail'],
        styles: placeStyles,
        icon: PIN,
        normalize: readPlaces,
        render: (data, ctx) => render(data, ctx, settings),
        skeleton,
        label,
        fallback,
        partial,
    });
}

/**
 * The place card with its built-in buttons and the device's clock — for `placeCard.segment(data)`.
 * Plug it in with `setupPlaceCard`, which also hears the card's own options.
 */
export const placeCard = createPlaceCard({ builtIns: true, currencySymbol: '$', now: () => new Date() });

/**
 * Draw a tool's places as this card — returns the function that stops it. Each place keeps
 * its Directions / Call / Website buttons beside the app's own `actions` unless `builtIns`
 * is `false`.
 */
export function setupPlaceCard(options: PlaceCardOptions = {}): () => void {
    const { currencySymbol, now, builtIns, mapTiles, mapAttribution, mapZoom, ...rest } = options;
    const tiles = str(mapTiles);
    const card = createPlaceCard({
        builtIns: builtIns !== false,
        currencySymbol: str(currencySymbol) ?? '$',
        now: now ?? (() => new Date()),
        // Only an http(s) address with the three placeholders: anything else draws the card's own map.
        ...(tiles && /^https?:\/\//i.test(tiles) && ['{z}', '{x}', '{y}'].every((p) => tiles.includes(p))
            ? { map: { tiles, attribution: str(mapAttribution), zoom: Math.round(Math.min(19, Math.max(1, num(mapZoom) ?? 16))) } }
            : {}),
    });
    return card.setup(rest);
}
