// The chart's stylesheet is a real `.css` file (readable as CSS, checked as CSS), inlined
// at build time and put on the page by the plugin itself — see `ensureStyles` in core.ts.
declare module '*.css?raw' {
    const css: string;
    export default css;
}
