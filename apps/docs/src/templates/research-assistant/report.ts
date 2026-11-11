/**
 * The report the agent writes with create_artifact is Markdown with a numbered reference list.
 * It is shown by the library's document panel (app.ts); this is what the template reads in it.
 */

/** How many entries the report's numbered reference list has. */
export function countSources(markdown: string): number {
    return (markdown.match(/^\d+\. \[/gm) ?? []).length;
}
