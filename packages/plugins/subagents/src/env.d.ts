// The plugin's stylesheet is a real `.css` file (readable as CSS, checked as CSS) and
// reaches the page through the segment renderer's `getStyles()` and the view's
// `ensureStyles()`. Vite inlines it at build time.
declare module '*.css?raw' {
    const css: string;
    export default css;
}
