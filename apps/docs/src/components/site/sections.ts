/**
 * The site's sections: the links in the header, and which pages belong to each.
 *
 * A page belongs to the section whose prefix its URL starts with, and its sidebar shows
 * that section's groups only. A page in no section — the home, Why, Compare, the roadmap,
 * the models — has no sidebar at all. A section is listed here once its pages exist, so
 * the header never offers a link to a section that is not there yet.
 */
export interface Section {
    id: string;
    label: string;
    /** Where the header's link goes. */
    href: string;
    /** The URL prefixes whose pages belong here. */
    prefixes: string[];
}

export const SECTIONS: Section[] = [
    { id: 'docs', label: 'Docs', href: '/guides/introduction/', prefixes: ['/guides/', '/frameworks/', '/providers/', '/examples/'] },
    { id: 'components', label: 'Components', href: '/components/', prefixes: ['/components/', '/segments/', '/kit/', '/plugins/'] },
    // No sidebar: the grid and the templates' own pages are not docs pages.
    { id: 'templates', label: 'Templates', href: '/templates/', prefixes: ['/templates/'] },
    // No sidebar either: the models aparté ships, each on a page of its own.
    { id: 'models', label: 'Models', href: '/models/', prefixes: ['/models/'] },
    // No sidebar: where the library is going, one page.
    { id: 'roadmap', label: 'Roadmap', href: '/roadmap/', prefixes: ['/roadmap/'] },
    { id: 'reference', label: 'Reference', href: '/reference/', prefixes: ['/reference/', '/changelog/'] },
];

/**
 * Starlight names a sidebar group it builds from a folder after the folder, and takes no other
 * name for it; the sidebar and the breadcrumb both show this name instead.
 */
const FOLDER_LABELS: Record<string, string> = { core: 'Core API' };
export const groupLabel = (label: string): string => FOLDER_LABELS[label] ?? label;

export function sectionOf(path: string): Section | undefined {
    return SECTIONS.find((s) => s.prefixes.some((prefix) => path.startsWith(prefix)));
}

/** The repository, linked from the header and the footer. */
export const REPO_URL = 'https://github.com/apartejs/aparte';

/** GitHub's mark (from Starlight's icon set): a brand glyph, so it lives with the site, not in core. */
export const GITHUB_PATH =
    'M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.83 1.24 1.83 1.24 1.08 1.83 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .31.2.69.82.57A12 12 0 0 0 12 .3Z';
