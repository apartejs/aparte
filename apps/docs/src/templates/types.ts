/**
 * What a template says about itself, in its folder's `meta.ts`. The grid at /templates/, the
 * full-screen page's bar, the social card and the sitemap all read it from there.
 */
export interface TemplateMeta {
    /** The folder's name, and the URL segment: /templates/<slug>/. */
    slug: string;
    /** What a reader calls it ("Assistant"). */
    title: string;
    /** One sentence: what it is and who it is for. */
    description: string;
    /** Its place in the grid. */
    order: number;
    /** The pieces of the library it shows, as catalogue page slugs (`approval`, `artifact`…). */
    uses: string[];
}
