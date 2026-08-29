// The card's stylesheet is a real `.css` file (readable as CSS, checked as CSS) and
// reaches the page through the renderer's `getStyles()` — the seam core keeps for a
// renderer that cannot edit core's sheets. Vite inlines it at build time.
declare module '*.css?raw' {
    const css: string;
    export default css;
}
