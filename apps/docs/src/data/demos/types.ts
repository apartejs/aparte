import type { DemoPlugin } from '../../components/demo/plugins';

/**
 * One live demo: a state of the library, as the string a reader copies.
 *
 * Read exactly twice — printed as the code block beside the frame, and mounted by
 * `/preview/demo/[id]` in it — so the picture and the code cannot disagree. A `<script>` in
 * `html` is a CLASSIC script, revived by PreviewDocument once the library and the named
 * plugins have loaded: it can call methods on an upgraded element, and it reaches a plugin
 * through `window.apartePlugins` because it cannot `import`.
 */
export interface DemoEntry {
    /** URL segment of `/preview/demo/<id>/`, unique across every demo of the site. */
    id: string;
    /** Announced as the frame's title. */
    title: string;
    /** The scenario: markup, plus an optional classic script that drives it. */
    html: string;
    /**
     * Plugins the preview document loads for this demo, beyond core (see
     * components/demo/PluginRuntime.astro). Named per demo rather than imported site-wide:
     * an unconditional import would put every plugin in every frame on the site.
     */
    plugins?: readonly DemoPlugin[];
}
