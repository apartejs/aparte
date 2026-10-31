/**
 * @aparte/plugin-cards/media — a tool's pictures, videos and sounds, drawn as a card: one
 * photo large, a gallery as a mosaic, a row of thumbnails, a lightbox to see each one big.
 *
 *   import { setupMediaCard } from '@aparte/plugin-cards/media';
 *
 *   setupMediaCard({ tool: 'generate_image' });                         // DALL·E's `{ data: [{ url }] }` as it is
 *   setupMediaCard({ tool: 'search_photos', map: (r) => r.results });   // Unsplash, Pexels…
 *
 * One medium, several (`[...]`), or `{ title, items: [...] }`. Three variants of one card:
 * `single` (the first medium large, its caption under it), `gallery` (a mosaic, the first
 * larger, "+3" on the last tile) and `strip` (square thumbnails that scroll sideways). Every
 * picture opens in a lightbox: the browser's own `<dialog>`, wearing core's `.aparte-dialog`.
 *
 * Nothing here plays a third party: a video is the native `<video>`, a sound the native
 * `<audio>`, and a YouTube or Vimeo page is a poster that LINKS to it — no iframe, no
 * player script. What the browser fetches is what the tool's data names — the medium, its
 * poster — and nothing else: no thumbnail is derived from a video's address, no service
 * is asked about a link. An HLS or DASH stream (`.m3u8`, `.mpd`) plays in the native
 * `<video>` only where the browser says it can (Safari, for HLS); elsewhere it would need a
 * player script, so it is a poster that links out, like a YouTube page.
 */
import type { AparteConfig } from '@aparte/core';
import { carousel } from '../kit/carousel.js';
import { defineCard, type CardContext, type CardSetupOptions } from '../kit/define.js';
import { el, glyph, num, safeUrl, str, webUrl, type Loose } from '../kit/dom.js';
import { formatNumber, formatUnit } from '../kit/format.js';
import { KIT_WORDS, word, type CardWord } from '../kit/strings.js';
import { CAMERA, EXPAND, EXTERNAL, FRAMES, PLAY, kindGlyph } from './icons.js';
import mediaStyles from './media.css?raw';

export type MediaKind = 'image' | 'video' | 'audio';
export type MediaVariant = 'single' | 'gallery' | 'strip';

/**
 * A medium as `map` returns it. Only `src` is needed; every other field adds something when
 * it is there and nothing when it is not. `readMedia` also reads the usual aliases (listed
 * on each field).
 */
export interface MediumInput {
    /** Read from the address's extension or `mimeType` when absent. Also `type`, `mediaType`. */
    kind?: MediaKind;
    /** An `http(s)` address. Also `url`, `link`, `href`, `image`, `imageUrl`, `thumbnail`, Unsplash's `urls.regular`. */
    src: string;
    /** The still shown before a video plays, the cover of a sound, a smaller copy of an image for its tile. Also `thumb`, `preview`. */
    poster?: string;
    title?: string;
    /** Also `description`, and an image model's `revised_prompt`. */
    caption?: string;
    /** Who made it, or where it comes from. Also `author`, `source`, `photographer`, Unsplash's `user.name`. */
    credit?: string;
    /** What the picture shows, for a reader who cannot see it. Also `alt_description`. */
    alt?: string;
    /** With `height`, reserves the picture's shape before it loads — nothing jumps when it does. */
    width?: number;
    height?: number;
    /** In seconds; `"3:42"` and ISO 8601 (`"PT3M42S"`) are read too. */
    duration?: number | string;
    mimeType?: string;
    /** The page the medium comes from. */
    url?: string;
}

/** A medium as the card draws it, once read. */
export interface Medium {
    kind: MediaKind;
    src: string;
    /**
     * Set when `src` is a video's page on a site that plays it itself ("YouTube", "Vimeo"):
     * drawn as a poster that links out, never embedded.
     */
    site?: string;
    poster?: string;
    title?: string;
    caption?: string;
    credit?: string;
    alt?: string;
    width?: number;
    height?: number;
    duration?: number;
    mimeType?: string;
    url?: string;
}

/** The card's data: one medium or several, and the collection's title. */
export interface MediaData {
    title?: string;
    items: Medium[];
}

export type MediaCardOptions = CardSetupOptions<MediaData, MediaVariant>;

const M = {
    cardsMediaTitle: { en: 'Media', fr: 'Médias', de: 'Medien', es: 'Multimedia', it: 'Contenuti multimediali', ja: 'メディア', ko: '미디어', pt: 'Mídia', ru: 'Медиа', zh: '媒体' },
    cardsMediaPhotoCount: { en: '{n} photos', fr: '{n} photos', de: '{n} Fotos', es: '{n} fotos', it: '{n} foto', ja: '写真{n}枚', ko: '사진 {n}장', pt: '{n} fotos', ru: 'Фото: {n}', zh: '{n} 张照片' },
    cardsMediaVideoCount: { en: '{n} videos', fr: '{n} vidéos', de: '{n} Videos', es: '{n} vídeos', it: '{n} video', ja: '動画{n}本', ko: '동영상 {n}개', pt: '{n} vídeos', ru: 'Видео: {n}', zh: '{n} 个视频' },
    cardsMediaCount: { en: '{n} items', fr: '{n} éléments', de: '{n} Elemente', es: '{n} elementos', it: '{n} elementi', ja: 'メディア{n}件', ko: '미디어 {n}개', pt: '{n} itens', ru: 'Файлов: {n}', zh: '{n} 个媒体' },
    cardsMediaImage: { en: 'Image', fr: 'Image', de: 'Bild', es: 'Imagen', it: 'Immagine', ja: '画像', ko: '이미지', pt: 'Imagem', ru: 'Изображение', zh: '图片' },
    cardsMediaVideo: { en: 'Video', fr: 'Vidéo', de: 'Video', es: 'Vídeo', it: 'Video', ja: '動画', ko: '동영상', pt: 'Vídeo', ru: 'Видео', zh: '视频' },
    cardsMediaAudio: { en: 'Audio', fr: 'Audio', de: 'Audio', es: 'Audio', it: 'Audio', ja: '音声', ko: '오디오', pt: 'Áudio', ru: 'Аудио', zh: '音频' },
    cardsMediaMore: { en: '{n} more', fr: '{n} de plus', de: '{n} weitere', es: '{n} más', it: 'altri {n}', ja: 'ほか{n}件', ko: '{n}개 더', pt: 'mais {n}', ru: 'ещё {n}', zh: '另外 {n} 个' },
    cardsMediaView: { en: 'View larger', fr: 'Agrandir', de: 'Vergrößern', es: 'Ampliar', it: 'Ingrandisci', ja: '拡大表示', ko: '크게 보기', pt: 'Ampliar', ru: 'Увеличить', zh: '放大查看' },
    cardsMediaClose: { en: 'Close', fr: 'Fermer', de: 'Schließen', es: 'Cerrar', it: 'Chiudi', ja: '閉じる', ko: '닫기', pt: 'Fechar', ru: 'Закрыть', zh: '关闭' },
    cardsMediaWatchOn: { en: 'Watch on {site}', fr: 'Regarder sur {site}', de: 'Auf {site} ansehen', es: 'Ver en {site}', it: 'Guarda su {site}', ja: '{site}で見る', ko: '{site}에서 보기', pt: 'Assistir no {site}', ru: 'Смотреть на {site}', zh: '在 {site} 上观看' },
} satisfies Record<string, CardWord>;

const KIND_WORD = { image: 'cardsMediaImage', video: 'cardsMediaVideo', audio: 'cardsMediaAudio' } as const;

/** The most media one card holds; a search that returns a hundred is a page, not a card. */
const MAX_MEDIA = 24;
/** The tiles a gallery's mosaic shows; the last says how many more the lightbox holds. */
const GALLERY_TILES = 6;

// ── Reading ──────────────────────────────────────────────────────────────────

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp|ico|heic|heif|jxl)$/i;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv|mkv|m3u8|mpd)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)$/i;

/** A video site whose page plays the video itself: linked to, never embedded. */
function videoSite(url: string): string | undefined {
    const host = new URL(url).hostname.replace(/^(www|m)\./, '');
    if (host === 'youtu.be' || /(^|\.)youtube(-nocookie)?\.com$/.test(host)) return 'YouTube';
    if (/(^|\.)vimeo\.com$/.test(host)) return 'Vimeo';
    return undefined;
}

/** The kind a tool's word or MIME type says: "photo", "image/png", "podcast". */
function kindOfWord(value: unknown): MediaKind | undefined {
    const s = str(value)?.toLowerCase();
    if (!s) return undefined;
    if (/^image\/|^(image|photo|picture|img|gif|illustration|drawing)s?$/.test(s)) return 'image';
    if (/^video\/|^application\/(x-mpegurl|vnd\.apple\.mpegurl|dash\+xml)$|^(video|movie|clip|film)s?$/.test(s)) return 'video';
    if (/^audio\/|^(audio|sound|music|song|track|podcast|voice|recording)s?$/.test(s)) return 'audio';
    return undefined;
}

/**
 * A stream's type, when the medium is one: HLS or DASH, by its MIME type or its extension.
 * A playlist, not a file — Chrome and Firefox play neither in a `<video>` without a player
 * script, which this card does not load.
 */
function streamType(m: Medium): string | undefined {
    if (m.mimeType && /^application\/(x-mpegurl|vnd\.apple\.mpegurl|dash\+xml)$/i.test(m.mimeType)) return m.mimeType;
    const path = new URL(m.src).pathname;
    if (/\.m3u8$/i.test(path)) return 'application/vnd.apple.mpegurl';
    if (/\.mpd$/i.test(path)) return 'application/dash+xml';
    return undefined;
}

/** Whether the browser's own `<video>` plays this medium: asked, for a stream (Safari says "maybe" to HLS). */
function playsHere(m: Medium): boolean {
    const type = streamType(m);
    return !type || document.createElement('video').canPlayType(type) !== '';
}

function kindOfUrl(url: string): MediaKind | undefined {
    const path = new URL(url).pathname;
    if (IMAGE_EXT.test(path)) return 'image';
    if (VIDEO_EXT.test(path)) return 'video';
    if (AUDIO_EXT.test(path)) return 'audio';
    return undefined;
}

/**
 * A length in seconds from what tools write: a number, `"3:42"`, `"1:02:03"`, ISO 8601's
 * `"PT3M42S"` (YouTube's API). `undefined` for anything else.
 */
export function readDuration(value: unknown): number | undefined {
    const n = num(value);
    if (n !== undefined) return n >= 0 ? n : undefined;
    const s = str(value);
    if (!s) return undefined;
    const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/.exec(s);
    if (clock) {
        const [h, m, sec] = [Number(clock[1] ?? 0), Number(clock[2]), Number(clock[3])];
        if (sec > 59 || (clock[1] !== undefined && m > 59)) return undefined;
        return h * 3600 + m * 60 + sec;
    }
    const iso = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(s);
    if (iso && (iso[1] || iso[2] || iso[3])) return Number(iso[1] ?? 0) * 3600 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0);
    return undefined;
}

function textOf(value: unknown): string | undefined {
    if (value && typeof value === 'object') {
        const o = value as Record<string, unknown>;
        return str(o['name'] ?? o['title'] ?? o['text'] ?? o['username']);
    }
    return str(value);
}

/** An address given as a string, or as an object that holds one — Pexels' `src` is `{ large, original, … }`. */
function linkOf(value: unknown): unknown {
    const first = Array.isArray(value) ? value[0] : value;
    if (!first || typeof first !== 'object') return first;
    const o = first as Record<string, unknown>;
    for (const key of ['url', 'src', 'href', 'uri', 'link', 'regular', 'large2x', 'large', 'medium', 'original', 'full', 'small']) {
        if (typeof o[key] === 'string') return o[key];
    }
    return undefined;
}

/**
 * An address a medium can be loaded from: `http(s)`, protocol-relative, or a path on this
 * site. A bare word ("nope", Google's photo names) would resolve against the page and load
 * something that is not there.
 */
function address(value: unknown): string | undefined {
    const s = str(linkOf(value));
    if (!s || !(/^https?:\/\//i.test(s) || s.startsWith('/'))) return undefined;
    // A path on the app's own server (`/uploads/cat.png`) on purpose: media an app serves
    // itself. `webUrl` refuses relative addresses, so this one is resolved here.
    if (s.startsWith('/') && !s.startsWith('//')) {
        const own = safeUrl(s);
        return own && /^https?:/i.test(own) ? own : undefined;
    }
    return webUrl(s.startsWith('//') ? `https:${s}` : s) ?? undefined;
}

const positive = (value: unknown) => {
    const n = num(value);
    return n !== undefined && n > 0 ? n : undefined;
};

function readMedium(raw: unknown): Medium | null {
    const value = typeof raw === 'string' ? { src: raw } : raw;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const r = value as Loose;
    const urls = r['urls'] && typeof r['urls'] === 'object' ? r['urls'] : {};
    const videoFile = Array.isArray(r['video_files']) ? r['video_files'].find((f: Loose) => address(f?.['link'])) : undefined;
    // Where the medium is, from the key surest of it. `url` and `link` come late: beside a
    // proper source they are the page the medium comes from (Unsplash, Pexels).
    const sources: Array<[string, unknown]> = [
        ['src', r['src']], ['videoFile', videoFile?.['link']], ['image', r['image']], ['imageUrl', r['imageUrl'] ?? r['image_url']],
        ['urls', urls['regular'] ?? urls['full'] ?? urls['small'] ?? urls['raw']], ['contentUrl', r['contentUrl'] ?? r['fileUrl'] ?? r['file_url']],
        ['url', r['url']], ['link', r['link']], ['href', r['href']], ['thumbnail', r['thumbnail']],
    ];
    let src: string | undefined;
    let from = '';
    for (const [key, candidate] of sources) {
        const url = address(candidate);
        if (url) {
            src = url;
            from = key;
            break;
        }
    }
    if (!src) return null;

    const page = [r['page'], r['pageUrl'], r['page_url'], r['links']?.['html'], from === 'url' ? undefined : r['url'], from === 'link' ? undefined : r['link'], r['sourceUrl'], r['source_url']]
        .map(address)
        .find((v) => v && v !== src);
    const poster = [r['poster'], r['thumb'], r['preview'], r['previewUrl'], r['preview_url'], urls['small'], from === 'thumbnail' ? undefined : r['thumbnail'], videoFile ? r['image'] : undefined, r['cover'], r['artwork']]
        .map(address)
        .find((v) => v && v !== src);
    const mimeType = str(r['mimeType'] ?? r['mime_type'] ?? r['mime'] ?? r['contentType'] ?? r['content_type'] ?? r['encodingFormat'] ?? videoFile?.['file_type']);
    const site = videoSite(src);
    const kind: MediaKind = site
        ? 'video'
        : kindOfWord(r['kind'] ?? r['mediaType'] ?? r['media_type'] ?? r['type']) ?? kindOfWord(mimeType) ?? (videoFile ? 'video' : undefined) ?? kindOfUrl(src) ?? 'image';
    // A credit that is an address is a page, not a name.
    const creditText = textOf(r['credit'] ?? r['author'] ?? r['photographer'] ?? r['artist'] ?? r['creator'] ?? r['user'] ?? r['source'] ?? r['attribution'] ?? r['channelTitle'] ?? r['channel']);
    const width = positive(r['width'] ?? r['w']);
    const height = positive(r['height'] ?? r['h']);
    const ms = positive(r['duration_ms'] ?? r['durationMs']);
    const duration = ms !== undefined ? ms / 1000 : readDuration(r['duration'] ?? r['length'] ?? r['durationSeconds'] ?? r['duration_seconds']);
    return {
        kind,
        src,
        ...(site ? { site } : {}),
        poster,
        title: textOf(r['title'] ?? r['name']),
        caption: textOf(r['caption'] ?? r['description'] ?? r['revised_prompt'] ?? r['revisedPrompt'] ?? r['summary']),
        credit: creditText && !/^https?:\/\//i.test(creditText) ? creditText : undefined,
        alt: str(r['alt'] ?? r['altText'] ?? r['alt_text'] ?? r['alt_description'] ?? r['revised_prompt']),
        // Both or neither: one side alone says nothing of the shape.
        ...(width && height ? { width, height } : {}),
        duration,
        mimeType: mimeType?.includes('/') ? mimeType : undefined,
        url: page,
    };
}

/**
 * The card's data from what `map` returns: one medium (an object, or its address), an array,
 * or a collection (`{ title?, items | media | images | photos | videos | results | data }` —
 * the last is an image model's answer). At most 24; `null` when not one has an `http(s)` source.
 */
export function readMedia(raw: unknown): MediaData | null {
    const value = typeof raw === 'string' ? [raw] : raw;
    if (!value || typeof value !== 'object') return null;
    let title: string | undefined;
    let list: unknown[];
    if (Array.isArray(value)) {
        list = value;
    } else {
        const r = value as Record<string, unknown>;
        const nested = ['items', 'media', 'images', 'photos', 'videos', 'results', 'data', 'files'].map((k) => r[k]).find(Array.isArray);
        if (nested) {
            list = nested;
            title = str(r['title']);
        } else {
            list = [value];
        }
    }
    const items = list.map(readMedium).filter((m): m is Medium => m !== null).slice(0, MAX_MEDIA);
    return items.length ? { ...(title ? { title } : {}), items } : null;
}

/** A length as a player writes it, in the chat's digits: `3:42`, `1:02:03`. */
export function formatDuration(config: AparteConfig, seconds: number): string {
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const plain = (v: number) => formatNumber(config, v, { useGrouping: false });
    const two = (v: number) => formatNumber(config, v, { minimumIntegerDigits: 2, useGrouping: false });
    return h ? `${plain(h)}:${two(m)}:${two(s)}` : `${plain(m)}:${two(s)}`;
}

/** The same length said in words, for a label: "3 min 42 sec". */
function spokenDuration(config: AparteConfig, seconds: number): string {
    const total = Math.round(seconds);
    const parts: Array<[number, string]> = [[Math.floor(total / 3600), 'hour'], [Math.floor((total % 3600) / 60), 'minute'], [total % 60, 'second']];
    const said = parts.filter(([v]) => v > 0).map(([v, unit]) => formatUnit(config, v, unit));
    return said.length ? said.join(' ') : formatUnit(config, 0, 'second');
}

/** ISO 8601 for `<time datetime>`: `PT3M42S`. */
function isoDuration(seconds: number): string {
    const total = Math.round(seconds);
    return `PT${Math.floor(total / 3600)}H${Math.floor((total % 3600) / 60)}M${total % 60}S`;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const kindWord = (config: AparteConfig, kind: MediaKind) => word(config, KIND_WORD[kind], M[KIND_WORD[kind]]);

/** What a medium is called: its title, else what it shows, else "Image 3" ("Image" alone for one). */
function nameOf(config: AparteConfig, m: Medium, index?: number): string {
    const own = m.title ?? m.alt ?? m.caption;
    if (own) return own;
    return index === undefined ? kindWord(config, m.kind) : `${kindWord(config, m.kind)} ${formatNumber(config, index + 1)}`;
}

/** A picture's alternative text: what it shows first, then what it is called. */
const altOf = (config: AparteConfig, m: Medium, index?: number) => m.alt ?? nameOf(config, m, index);

function countLabel(config: AparteConfig, items: Medium[]): string {
    const n = formatNumber(config, items.length);
    if (items.every((m) => m.kind === 'image')) return word(config, 'cardsMediaPhotoCount', M.cardsMediaPhotoCount, { n });
    if (items.every((m) => m.kind === 'video')) return word(config, 'cardsMediaVideoCount', M.cardsMediaVideoCount, { n });
    return word(config, 'cardsMediaCount', M.cardsMediaCount, { n });
}

/** The kind's glyph, on a soft tint, behind where the picture goes: what shows before it loads, or instead of it. */
function placeholder(kind: MediaKind): HTMLElement {
    return el('span', { class: 'aparte-media__placeholder', attrs: { 'aria-hidden': 'true' } },
        glyph(kindGlyph(kind), 'aparte-rich-card__glyph aparte-media__placeholder-glyph'));
}

/**
 * A picture in `holder`, lazy and decoded off the main thread. One that fails to load is
 * removed, and the holder's placeholder is what shows. `alt` null: the picture is
 * decoration, its holder is named some other way.
 */
function picture(ctx: CardContext, holder: HTMLElement, src: string, alt: (() => string) | null, className = 'aparte-media__img'): HTMLImageElement {
    const img = el('img', { class: className, attrs: { src, loading: 'lazy', decoding: 'async' } });
    if (alt) ctx.bind(img, alt, 'alt');
    else img.setAttribute('alt', '');
    img.addEventListener('load', () => holder.removeAttribute('data-loading'), { once: true });
    img.addEventListener('error', () => {
        img.remove();
        holder.removeAttribute('data-loading');
        holder.setAttribute('data-broken', '');
    }, { once: true });
    return img;
}

/**
 * The medium's shape, when its data gives it: the frame is drawn that size before a byte
 * arrives, so nothing below it jumps. Numbers the reader checked, set as properties — never
 * a style string.
 */
function reserve(holder: HTMLElement, m: Medium): void {
    if (!m.width || !m.height) return;
    holder.style.setProperty('--aparte-media-ratio', `${m.width} / ${m.height}`);
    holder.style.setProperty('--aparte-media-ratio-n', String(m.width / m.height));
    holder.setAttribute('data-sized', '');
}

function durationOf(ctx: CardContext, seconds: number, className: string, hidden = false): HTMLElement {
    const node = el('time', { class: className, attrs: { datetime: isoDuration(seconds), 'aria-hidden': hidden ? 'true' : undefined } });
    ctx.bind(node, () => formatDuration(ctx.config, seconds));
    return node;
}

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, '');

/** One image, as large as its shape allows; a button that opens it larger still. */
function imageFrame(ctx: CardContext, m: Medium, open: (from: HTMLElement) => void): HTMLElement {
    const frame = el('button', { class: 'aparte-media__frame', attrs: { type: 'button', 'aria-haspopup': 'dialog', 'data-kind': 'image', 'data-loading': '' } });
    reserve(frame, m);
    frame.append(placeholder('image'), picture(ctx, frame, m.src, () => altOf(ctx.config, m)),
        glyph(EXPAND, 'aparte-rich-card__glyph aparte-media__zoom'));
    ctx.bind(frame, () => word(ctx.config, 'cardsMediaView', M.cardsMediaView), 'title');
    frame.addEventListener('click', () => open(frame));
    return frame;
}

/** A video the browser plays: its own controls, only its length fetched until asked. */
function videoFrame(ctx: CardContext, m: Medium, className = 'aparte-media__frame aparte-media__frame--video'): HTMLElement {
    const frame = el('div', { class: className, attrs: { 'data-kind': 'video' } });
    reserve(frame, m);
    const video = el('video', {
        class: 'aparte-media__video',
        attrs: { controls: true, preload: 'metadata', playsinline: true, src: m.src, poster: m.poster },
    });
    ctx.bind(video, () => nameOf(ctx.config, m), 'aria-label');
    frame.append(video);
    return frame;
}

/**
 * A YouTube or Vimeo page — or a stream this browser cannot play, linked to the page that
 * plays it when the tool names one, else to the stream itself: its poster, a play disc and
 * the site's name. A link out, never a player.
 */
function externalFrame(ctx: CardContext, m: Medium): HTMLElement {
    const href = m.site ? m.src : (m.url ?? m.src);
    const site = m.site ?? hostOf(href);
    const frame = el('a', {
        class: 'aparte-media__frame aparte-media__external',
        attrs: { href, target: '_blank', rel: 'noopener noreferrer', 'data-kind': 'video' },
    });
    reserve(frame, m);
    frame.append(placeholder('video'));
    if (m.poster) frame.append(picture(ctx, frame, m.poster, null));
    frame.append(
        el('span', { class: 'aparte-media__play', attrs: { 'aria-hidden': 'true' } }, glyph(PLAY, 'aparte-rich-card__glyph aparte-media__play-glyph')),
        el('span', { class: 'aparte-media__site', attrs: { 'aria-hidden': 'true' } }, glyph(EXTERNAL, 'aparte-rich-card__glyph aparte-media__site-glyph'), site),
    );
    if (m.duration !== undefined) frame.append(durationOf(ctx, m.duration, 'aparte-media__duration', true));
    ctx.bind(frame, () => `${nameOf(ctx.config, m)} — ${word(ctx.config, 'cardsMediaWatchOn', M.cardsMediaWatchOn, { site })}`, 'aria-label');
    return frame;
}

/**
 * A sound: its cover (or a note on a tint), its title and who made it, its length, a
 * waveform that is only decoration — drawn by the sheet, it shows no real level — and the
 * browser's own player under it. The waveform moves while the sound plays.
 */
function audioBlock(ctx: CardContext, m: Medium): HTMLElement {
    const cover = el('span', { class: 'aparte-media__cover', attrs: { 'data-kind': 'audio' } }, placeholder('audio'));
    if (m.poster) cover.append(picture(ctx, cover, m.poster, null));
    const title = el('div', { class: 'aparte-media__audio-title' });
    ctx.bind(title, () => m.title ?? kindWord(ctx.config, 'audio'));
    const text = el('div', { class: 'aparte-media__audio-text' }, title,
        m.credit ? el('div', { class: 'aparte-media__audio-credit', text: m.credit }) : null);
    const head = el('div', { class: 'aparte-media__audio-head' }, cover, text,
        m.duration !== undefined ? durationOf(ctx, m.duration, 'aparte-media__audio-length') : null);
    const audio = el('audio', { class: 'aparte-media__player', attrs: { controls: true, preload: 'metadata', src: m.src } });
    ctx.bind(audio, () => nameOf(ctx.config, m), 'aria-label');
    const block = el('div', { class: 'aparte-media__audio', attrs: { 'data-kind': 'audio' } },
        head, el('span', { class: 'aparte-media__wave', attrs: { 'aria-hidden': 'true' } }), audio);
    audio.addEventListener('play', () => block.setAttribute('data-playing', ''));
    for (const stop of ['pause', 'ended', 'emptied']) audio.addEventListener(stop, () => block.removeAttribute('data-playing'));
    return block;
}

/**
 * Under a medium: its title, its caption, and a line with who made it and the page it comes
 * from. `withTitle` false where the title is already drawn (a sound's header, the lightbox's).
 */
function captionOf(m: Medium, withTitle: boolean, tag: 'figcaption' | 'div' = 'figcaption'): HTMLElement | null {
    const title = withTitle && m.title ? el('div', { class: 'aparte-media__title', text: m.title }) : null;
    const caption = m.caption && m.caption !== m.title ? el('p', { class: 'aparte-media__caption', text: m.caption }) : null;
    const credit = m.credit && m.kind !== 'audio'
        ? el('span', { class: 'aparte-media__credit' }, glyph(m.kind === 'image' ? CAMERA : kindGlyph(m.kind), 'aparte-rich-card__glyph aparte-media__line-glyph'), el('span', { text: m.credit }))
        : null;
    const source = m.url
        ? el('a', { class: 'aparte-media__source', attrs: { href: m.url, target: '_blank', rel: 'noopener noreferrer' } },
            el('span', { text: hostOf(m.url) }), glyph(EXTERNAL, 'aparte-rich-card__glyph aparte-media__line-glyph'))
        : null;
    const meta = credit || source ? el('div', { class: 'aparte-media__meta' }, credit, source) : null;
    if (!title && !caption && !meta) return null;
    return el(tag, { class: 'aparte-media__figcaption' }, title, caption, meta);
}

/** What a medium shows where it is drawn whole — on the card alone, or on the lightbox's stage. */
function stageOf(ctx: CardContext, m: Medium, open: ((from: HTMLElement) => void) | null, index?: number): HTMLElement {
    if (m.kind === 'audio') return audioBlock(ctx, m);
    if (m.site || (m.kind === 'video' && !playsHere(m))) return externalFrame(ctx, m);
    if (m.kind === 'video') return videoFrame(ctx, m, open ? undefined : 'aparte-media__lb-video');
    if (open) return imageFrame(ctx, m, open);
    // In the lightbox: no lazy loading, it is the one picture on screen.
    const box = el('div', { class: 'aparte-media__lb-picture', attrs: { 'data-loading': '' } }, placeholder('image'));
    const img = picture(ctx, box, m.src, () => altOf(ctx.config, m, index), 'aparte-media__lb-img');
    img.removeAttribute('loading');
    box.append(img);
    return box;
}

/** A medium's tile in a mosaic or a row: a button that opens the lightbox on it. */
function tileOf(ctx: CardContext, m: Medium, index: number, more: number, open: (index: number, from: HTMLElement) => void): HTMLButtonElement {
    const tile = el('button', { class: 'aparte-media__tile', attrs: { type: 'button', 'aria-haspopup': 'dialog', 'data-kind': m.kind } });
    tile.append(placeholder(m.kind));
    // An image's tile may load its smaller copy; a video's and a sound's show their still, if any.
    const still = m.kind === 'image' ? (m.poster ?? m.src) : m.poster;
    if (still) tile.append(picture(ctx, tile, still, null, 'aparte-media__img'));
    if (m.kind === 'video') {
        tile.append(el('span', { class: 'aparte-media__play aparte-media__play--sm', attrs: { 'aria-hidden': 'true' } },
            glyph(PLAY, 'aparte-rich-card__glyph aparte-media__play-glyph')));
    }
    if (m.kind === 'audio' && m.title) tile.append(el('span', { class: 'aparte-media__tile-title', attrs: { 'aria-hidden': 'true' }, text: m.title }));
    if (m.duration !== undefined && m.kind !== 'image') tile.append(durationOf(ctx, m.duration, 'aparte-media__duration', true));
    if (more > 0) {
        const plus = el('span', { class: 'aparte-media__more', attrs: { 'aria-hidden': 'true' } });
        ctx.bind(plus, () => `+${formatNumber(ctx.config, more)}`);
        tile.append(plus);
    }
    // The tile's name says everything its face shows: what it is, how long, how many behind it.
    ctx.bind(tile, () => {
        const parts = [nameOf(ctx.config, m, index)];
        if (m.kind !== 'image' && (m.title ?? m.alt ?? m.caption)) parts.push(kindWord(ctx.config, m.kind));
        if (m.duration !== undefined && m.kind !== 'image') parts.push(spokenDuration(ctx.config, m.duration));
        if (more > 0) parts.push(word(ctx.config, 'cardsMediaMore', M.cardsMediaMore, { n: formatNumber(ctx.config, more) }));
        return parts.join(', ');
    }, 'aria-label');
    tile.addEventListener('click', () => open(index, tile));
    return tile;
}

/** The collection's name line: its title, and how many there are. */
function headingOf(ctx: CardContext, data: MediaData): HTMLElement {
    const count = el('span', { class: 'aparte-media__count' });
    ctx.bind(count, () => countLabel(ctx.config, data.items));
    return el('div', { class: 'aparte-media__heading' }, glyph(FRAMES, 'aparte-rich-card__glyph aparte-media__line-glyph'),
        data.title ? el('span', { class: 'aparte-media__heading-title', text: data.title }) : null, count);
}

let lightboxes = 0;

/** A text kept in the chat's language, and set again by `update()` when what it reads has moved. */
function live(ctx: CardContext, target: Element, compute: () => string, attr?: string): () => void {
    ctx.bind(target, compute, attr);
    return () => (attr ? target.setAttribute(attr, compute()) : (target.textContent = compute()));
}

/**
 * The lightbox: one `<dialog>` per card, made the first time it is opened, shown modally —
 * the browser traps the focus in it, closes it on Escape and puts the page behind it out of
 * reach; core's `.aparte-dialog` draws it and closes it from its backdrop. Arrows step
 * through the media (mirrored in a right-to-left page), Home and End jump to the ends, and
 * the focus goes back to the tile that opened it. Returns the function that opens it.
 */
function lightbox(ctx: CardContext, items: Medium[], host: () => HTMLElement): (index: number, from: HTMLElement) => void {
    let dialog: HTMLDialogElement | null = null;
    let index = 0;
    let opener: HTMLElement | null = null;
    let stage!: HTMLElement;
    let caption!: HTMLElement;
    const refresh: Array<() => void> = [];
    const navs: Array<[HTMLButtonElement, -1 | 1]> = [];
    const many = items.length > 1;

    function shut(): void {
        if (!dialog) return;
        if (typeof dialog.close === 'function') {
            dialog.close();
        } else {
            dialog.removeAttribute('open');
            dialog.dispatchEvent(new Event('close'));
        }
    }

    function show(i: number): void {
        index = Math.max(0, Math.min(items.length - 1, i));
        const m = items[index]!;
        stage.setAttribute('data-kind', m.kind);
        stage.replaceChildren(stageOf(ctx, m, null, many ? index : undefined));
        caption.replaceChildren(...(captionOf(m, false, 'div')?.childNodes ?? []));
        caption.hidden = !caption.childNodes.length;
        for (const update of refresh) update();
        // `aria-disabled`, not `disabled`: a disabled button drops the keyboard's focus.
        for (const [button, dir] of navs) button.setAttribute('aria-disabled', String(dir < 0 ? index === 0 : index === items.length - 1));
    }

    /** Step to `i`, if it is another medium: the ends do not redraw what is on the stage. */
    function go(i: number): void {
        if (i >= 0 && i < items.length && i !== index) show(i);
    }

    function navButton(dir: -1 | 1): HTMLButtonElement {
        const button = el('button', {
            class: `aparte-btn aparte-btn--icon aparte-btn--circle aparte-btn--surface aparte-media__lb-nav aparte-media__lb-nav--${dir < 0 ? 'prev' : 'next'}`,
            attrs: { type: 'button' },
        });
        button.innerHTML = ctx.config.getIcon(dir < 0 ? 'prevBranch' : 'nextBranch');
        ctx.bind(button, () => word(ctx.config, dir < 0 ? 'cardsPrevious' : 'cardsNext', dir < 0 ? KIT_WORDS.cardsPrevious : KIT_WORDS.cardsNext), 'aria-label');
        button.addEventListener('click', () => go(index + dir));
        navs.push([button, dir]);
        return button;
    }

    function onKey(event: KeyboardEvent): void {
        // A player's own keys seek and turn the volume: they are not ours to take.
        if ((event.target as Element | null)?.closest?.('video, audio')) return;
        const rtl = typeof getComputedStyle === 'function' && getComputedStyle(dialog!).direction === 'rtl';
        let to: number | undefined;
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') to = index + (event.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1);
        else if (event.key === 'Home') to = 0;
        else if (event.key === 'End') to = items.length - 1;
        else if (event.key === 'Escape' && typeof dialog!.showModal !== 'function') {
            // A browser without a modal dialog has no Escape of its own.
            event.preventDefault();
            shut();
            return;
        }
        if (to === undefined) return;
        event.preventDefault();
        go(to);
    }

    function build(): HTMLDialogElement {
        const id = `aparte-media-lightbox-${++lightboxes}`;
        const title = el('h2', { class: 'aparte-dialog__title aparte-media__lb-title', attrs: { id } });
        refresh.push(live(ctx, title, () => nameOf(ctx.config, items[index]!, many ? index : undefined)));
        const heading = el('div', { class: 'aparte-media__lb-heading' }, title);
        if (many) {
            const counter = el('span', { class: 'aparte-media__lb-counter' });
            refresh.push(live(ctx, counter, () => word(ctx.config, 'cardsSlide', KIT_WORDS.cardsSlide, {
                n: formatNumber(ctx.config, index + 1), total: formatNumber(ctx.config, items.length),
            })));
            heading.append(counter);
        }
        const close = el('button', { class: 'aparte-btn aparte-btn--icon aparte-btn--sm aparte-btn--ghost aparte-dialog__close aparte-media__lb-close', attrs: { type: 'button' } });
        close.innerHTML = ctx.config.getIcon('close');
        ctx.bind(close, () => word(ctx.config, 'cardsMediaClose', M.cardsMediaClose), 'aria-label');
        close.addEventListener('click', shut);
        stage = el('div', { class: 'aparte-media__lb-stage' });
        caption = el('div', { class: 'aparte-media__lb-caption' });
        const body = el('div', { class: 'aparte-media__lb-body' }, stage);
        if (many) body.append(navButton(-1), navButton(1));
        const node = el('dialog', { class: 'aparte-dialog aparte-dialog--lg aparte-media__lightbox', attrs: { 'aria-labelledby': id } },
            el('div', { class: 'aparte-dialog__header aparte-media__lb-head' }, heading, close), body, caption);
        node.addEventListener('keydown', onKey);
        node.addEventListener('close', () => {
            // A video left playing behind a closed dialog would go on talking.
            for (const media of stage.querySelectorAll<HTMLMediaElement>('video, audio')) if (!media.paused) media.pause();
            opener?.focus();
        });
        return node;
    }

    return (i, from) => {
        if (!dialog) {
            dialog = build();
            host().append(dialog);
        }
        opener = from;
        show(i);
        if (typeof dialog.showModal === 'function') {
            if (!dialog.open) dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
    };
}

function render(data: MediaData, ctx: CardContext<MediaVariant>): Node[] {
    const [first] = data.items as [Medium];
    let root: HTMLElement | undefined;
    const open = lightbox(ctx, data.items, () => root!);
    if (data.items.length === 1) {
        // One medium is drawn large whatever the variant: a mosaic or a row of one is a frame.
        root = el('figure', { class: 'aparte-media aparte-media--single', attrs: { 'data-kind': first.kind } },
            stageOf(ctx, first, (from) => open(0, from)), captionOf(first, first.kind !== 'audio'));
        return [root];
    }
    if (ctx.variant === 'strip') {
        const slides = data.items.map((m, i) => el('div', { class: 'aparte-media__thumb' }, tileOf(ctx, m, i, 0, open),
            m.title ? el('span', { class: 'aparte-media__thumb-title', attrs: { 'aria-hidden': 'true' }, text: m.title } ) : null));
        root = el('div', { class: 'aparte-media aparte-media--strip' }, headingOf(ctx, data),
            carousel(ctx, slides, { label: () => data.title ?? countLabel(ctx.config, data.items) }));
        return [root];
    }
    // Several media in `single` are a gallery too: drawing the first and dropping the rest
    // would hide what the tool returned.
    const shown = data.items.slice(0, GALLERY_TILES);
    const more = data.items.length - shown.length;
    const grid = el('ul', { class: 'aparte-media__grid', attrs: { 'data-count': shown.length } },
        ...shown.map((m, i) => el('li', { class: 'aparte-media__cell' }, tileOf(ctx, m, i, i === shown.length - 1 ? more : 0, open))));
    ctx.bind(grid, () => data.title ?? countLabel(ctx.config, data.items), 'aria-label');
    root = el('div', { class: 'aparte-media aparte-media--gallery' }, grid, headingOf(ctx, data));
    return [root];
}

function skeleton(partial: Partial<MediaData> | null, ctx: CardContext<MediaVariant>): Node[] {
    const block = (cls: string, kind: 'text' | 'rect' = 'rect') =>
        el('span', { class: `aparte-skeleton aparte-skeleton--${kind} ${cls}`, attrs: { 'aria-hidden': 'true' } });
    const known = partial?.title ?? partial?.items?.[0]?.title;
    if (ctx.variant === 'gallery') {
        return [el('div', { class: 'aparte-media aparte-media--gallery' },
            el('div', { class: 'aparte-media__grid', attrs: { 'data-count': 4 } }, ...Array.from({ length: 4 }, () => block('aparte-media__sk-cell'))),
            el('div', { class: 'aparte-media__heading' }, known ? el('span', { class: 'aparte-media__heading-title', text: known }) : block('aparte-media__sk-line', 'text')))];
    }
    if (ctx.variant === 'strip') {
        return [el('div', { class: 'aparte-media aparte-media--strip' },
            el('div', { class: 'aparte-media__heading' }, known ? el('span', { class: 'aparte-media__heading-title', text: known }) : block('aparte-media__sk-line', 'text')),
            el('div', { class: 'aparte-media__sk-row' }, ...Array.from({ length: 4 }, () => block('aparte-media__sk-thumb'))))];
    }
    return [el('div', { class: 'aparte-media aparte-media--single' }, block('aparte-media__sk-frame'),
        el('div', { class: 'aparte-media__figcaption' },
            known ? el('div', { class: 'aparte-media__title', text: known }) : block('aparte-media__sk-line', 'text'),
            block('aparte-media__sk-line aparte-media__sk-line--short', 'text')))];
}

function label(data: Partial<MediaData> | null, ctx: CardContext): string {
    const items = data?.items ?? [];
    if (items.length === 1) return nameOf(ctx.config, items[0]!);
    if (items.length > 1) return data!.title ?? countLabel(ctx.config, items);
    return data?.title ?? word(ctx.config, 'cardsMediaTitle', M.cardsMediaTitle);
}

/** One line a medium: "Sunset over Lille — Jane Doe (3:42): https://…", the address a model can use. */
function fallback(data: MediaData, ctx: CardContext): string {
    const lines = data.items.map((m, i) => {
        const name = nameOf(ctx.config, m, data.items.length > 1 ? i : undefined);
        const credit = m.credit ? ` — ${m.credit}` : '';
        const length = m.duration !== undefined ? ` (${formatDuration(ctx.config, m.duration)})` : '';
        return `${name}${credit}${length}: ${m.src}`;
    });
    return data.title ? `${data.title}:\n${lines.join('\n')}` : lines.join('\n');
}

/** What a running call already says: the prompt an image is made from, the search it answers. */
function partial(input: Record<string, unknown>): Partial<MediaData> | null {
    const title = str(input['prompt'] ?? input['query'] ?? input['q'] ?? input['search'] ?? input['title']);
    return title ? { title } : null;
}

/** The media card — for `mediaCard.segment(data)`. Plug it in with `setupMediaCard`. */
export const mediaCard = defineCard<MediaData, MediaVariant>({
    name: 'media',
    variants: ['single', 'gallery', 'strip'],
    styles: mediaStyles,
    icon: FRAMES,
    normalize: readMedia,
    render,
    skeleton,
    label,
    fallback,
    partial,
});

/** Draw a tool's media as this card — returns the function that stops it. */
export function setupMediaCard(options: MediaCardOptions = {}): () => void {
    return mediaCard.setup(options);
}
