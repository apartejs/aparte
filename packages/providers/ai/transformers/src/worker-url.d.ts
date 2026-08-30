/**
 * Vite's `?worker&url` import — the worker chunk is emitted and its URL comes back as a
 * string, which is what lets this package construct the worker itself (see `_spawnWorker`
 * in `index.ts`: a cross-origin package has to go through a blob).
 *
 * The type lives here rather than coming from `vite/client` because that would pull
 * Vite's whole ambient DOM surface into a package that ships types of its own.
 */
declare module '*?worker&url' {
    const src: string;
    export default src;
}
