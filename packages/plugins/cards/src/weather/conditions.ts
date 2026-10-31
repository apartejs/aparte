/**
 * The weather a card knows how to draw, and the doors to it from the APIs a tool calls.
 *
 * A tool returns its own codes — WMO numbers from Open-Meteo, ids from OpenWeather, a
 * sentence from elsewhere. The card draws eleven conditions; these functions turn a code
 * into one of them, so an app's `map` is one call instead of a table.
 */
import type { CardWord } from '../kit/strings.js';

export type WeatherCondition =
    | 'clear'
    | 'partly-cloudy'
    | 'cloudy'
    | 'fog'
    | 'drizzle'
    | 'rain'
    | 'heavy-rain'
    | 'sleet'
    | 'snow'
    | 'thunder'
    | 'wind';

export const WEATHER_CONDITIONS: readonly WeatherCondition[] = [
    'clear', 'partly-cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'heavy-rain', 'sleet', 'snow', 'thunder', 'wind',
];

/**
 * A WMO weather code (Open-Meteo's `weather_code`) as a condition.
 * https://open-meteo.com/en/docs — "WMO Weather interpretation codes".
 */
export function conditionFromWmo(code: unknown): WeatherCondition | undefined {
    const c = typeof code === 'string' ? Number(code) : code;
    if (typeof c !== 'number' || !Number.isFinite(c)) return undefined;
    if (c === 0) return 'clear';
    if (c === 1 || c === 2) return 'partly-cloudy';
    if (c === 3) return 'cloudy';
    if (c === 45 || c === 48) return 'fog';
    if (c >= 51 && c <= 55) return 'drizzle';
    if (c === 56 || c === 57 || c === 66 || c === 67) return 'sleet';
    if (c === 61 || c === 63 || c === 80 || c === 81) return 'rain';
    if (c === 65 || c === 82) return 'heavy-rain';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
    if (c >= 95 && c <= 99) return 'thunder';
    return undefined;
}

/**
 * An OpenWeather condition id (`weather[0].id`) as a condition.
 * https://openweathermap.org/weather-conditions
 */
export function conditionFromOpenWeather(id: unknown): WeatherCondition | undefined {
    const c = typeof id === 'string' ? Number(id) : id;
    if (typeof c !== 'number' || !Number.isFinite(c)) return undefined;
    if (c >= 200 && c < 300) return 'thunder';
    if (c >= 300 && c < 400) return 'drizzle';
    if (c === 511 || (c >= 611 && c <= 616)) return 'sleet';
    if (c >= 502 && c <= 504) return 'heavy-rain';
    if (c === 522 || c === 531) return 'heavy-rain';
    if (c >= 500 && c < 600) return 'rain';
    if (c >= 600 && c < 700) return 'snow';
    if (c === 771 || c === 781) return 'wind';
    if (c >= 700 && c < 800) return 'fog';
    if (c === 800) return 'clear';
    if (c === 801 || c === 802) return 'partly-cloudy';
    if (c === 803 || c === 804) return 'cloudy';
    return undefined;
}

/** Words for each condition, in English and French, matched inside a sentence. Order matters: most specific first. */
const TEXT_MATCHES: Array<[RegExp, WeatherCondition]> = [
    [/thunder|storm|orage|lightning/i, 'thunder'],
    [/sleet|freezing|verglas|grésil|hail|grêle/i, 'sleet'],
    [/snow|neige|blizzard|flurr/i, 'snow'],
    [/heavy rain|downpour|torrential|forte pluie|averse forte|déluge/i, 'heavy-rain'],
    [/drizzle|bruine|crachin/i, 'drizzle'],
    [/rain|shower|pluie|pluvieux|averse/i, 'rain'],
    [/fog|mist|haze|brouillard|brume/i, 'fog'],
    [/partly|partial|scattered|few clouds|mostly sunny|éclaircie|partiellement|peu nuageux/i, 'partly-cloudy'],
    [/cloud|overcast|couvert|nuageux|gris/i, 'cloudy'],
    [/wind|gust|vent|rafale/i, 'wind'],
    [/clear|sunny|fair|soleil|ensoleillé|dégagé/i, 'clear'],
];

/** A description ("Light rain", "Partiellement nuageux") as a condition — English and French. */
export function conditionFromText(text: unknown): WeatherCondition | undefined {
    if (typeof text !== 'string' || !text.trim()) return undefined;
    const known = text.trim().toLowerCase().replace(/[\s_]+/g, '-');
    if ((WEATHER_CONDITIONS as readonly string[]).includes(known)) return known as WeatherCondition;
    for (const [re, condition] of TEXT_MATCHES) if (re.test(text)) return condition;
    return undefined;
}

/** What each condition is called, when the tool gives no description of its own. */
export const CONDITION_WORDS: Record<WeatherCondition, CardWord> = {
    clear: { en: 'Clear', fr: 'Dégagé', de: 'Klar', es: 'Despejado', it: 'Sereno', ja: '晴れ', ko: '맑음', pt: 'Céu limpo', ru: 'Ясно', zh: '晴' },
    'partly-cloudy': { en: 'Partly cloudy', fr: 'Partiellement nuageux', de: 'Teilweise bewölkt', es: 'Parcialmente nublado', it: 'Parzialmente nuvoloso', ja: '晴れ時々曇り', ko: '구름 조금', pt: 'Parcialmente nublado', ru: 'Переменная облачность', zh: '多云' },
    cloudy: { en: 'Cloudy', fr: 'Couvert', de: 'Bewölkt', es: 'Nublado', it: 'Nuvoloso', ja: '曇り', ko: '흐림', pt: 'Nublado', ru: 'Облачно', zh: '阴' },
    fog: { en: 'Fog', fr: 'Brouillard', de: 'Nebel', es: 'Niebla', it: 'Nebbia', ja: '霧', ko: '안개', pt: 'Nevoeiro', ru: 'Туман', zh: '雾' },
    drizzle: { en: 'Drizzle', fr: 'Bruine', de: 'Nieselregen', es: 'Llovizna', it: 'Pioviggine', ja: '霧雨', ko: '이슬비', pt: 'Garoa', ru: 'Морось', zh: '毛毛雨' },
    rain: { en: 'Rain', fr: 'Pluie', de: 'Regen', es: 'Lluvia', it: 'Pioggia', ja: '雨', ko: '비', pt: 'Chuva', ru: 'Дождь', zh: '雨' },
    'heavy-rain': { en: 'Heavy rain', fr: 'Forte pluie', de: 'Starkregen', es: 'Lluvia intensa', it: 'Pioggia forte', ja: '大雨', ko: '폭우', pt: 'Chuva forte', ru: 'Сильный дождь', zh: '大雨' },
    sleet: { en: 'Sleet', fr: 'Pluie verglaçante', de: 'Schneeregen', es: 'Aguanieve', it: 'Nevischio', ja: 'みぞれ', ko: '진눈깨비', pt: 'Granizo fino', ru: 'Мокрый снег', zh: '雨夹雪' },
    snow: { en: 'Snow', fr: 'Neige', de: 'Schnee', es: 'Nieve', it: 'Neve', ja: '雪', ko: '눈', pt: 'Neve', ru: 'Снег', zh: '雪' },
    thunder: { en: 'Thunderstorm', fr: 'Orage', de: 'Gewitter', es: 'Tormenta', it: 'Temporale', ja: '雷雨', ko: '뇌우', pt: 'Trovoada', ru: 'Гроза', zh: '雷雨' },
    wind: { en: 'Windy', fr: 'Venteux', de: 'Windig', es: 'Ventoso', it: 'Ventoso', ja: '強風', ko: '바람', pt: 'Ventoso', ru: 'Ветрено', zh: '有风' },
};
