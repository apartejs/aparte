/**
 * Map an artifact MIME type to a renderer kind — `'react'`, `'html'`, `'js'`, `'css'`,
 * `'svg'`, `'json'`, `'markdown'`, `'csv'`, `'text'` — or `fallback` (default
 * `'unknown'`) for anything else. Anthropic's `application/vnd.ant.*` namespace maps to
 * its suffix; exact standard MIMEs are matched first, then a substring rescue for
 * parameterised or vendor variants (`text/html; charset=utf-8`, `application/ld+json`).
 *
 * THE implementation, and the plugin's: it used to live in `@aparte/engine` and be
 * re-exported by `@aparte/core`, because the engine's built-in `create_artifact` and
 * core's parser both needed it. Neither does any more — an artifact is a plugin's
 * convention, so the function that names its kinds is the plugin's too.
 *
 * @example
 * deriveArtifactKind('application/vnd.ant.react')  // 'react'
 * deriveArtifactKind('text/html; charset=utf-8')   // 'html'
 * deriveArtifactKind('font/woff2', 'text')         // 'text' (fallback)
 */
export function deriveArtifactKind(mimeType: string, fallback = 'unknown'): string {
    const m = (mimeType || '').toLowerCase().trim();
    const ant = m.match(/^application\/vnd\.ant\.([a-z0-9-]+)/);
    if (ant) return ant[1]!;
    if (m === 'text/html' || m === 'application/xhtml+xml') return 'html';
    if (m === 'application/javascript' || m === 'text/javascript') return 'js';
    if (m === 'text/css') return 'css';
    if (m === 'image/svg+xml') return 'svg';
    if (m === 'application/json') return 'json';
    if (m === 'text/markdown') return 'markdown';
    if (m === 'text/csv') return 'csv';
    if (m === 'text/plain') return 'text';
    // The binary kinds the file card knows, by their standard names — a model calling
    // the tool with a real MIME type must land on the same path as `vnd.ant.pdf`.
    if (m === 'application/pdf') return 'pdf';
    if (m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
    if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (m.includes('react')) return 'react';
    if (m.includes('html')) return 'html';
    if (m.includes('javascript')) return 'js';
    if (m.includes('css')) return 'css';
    if (m.includes('svg')) return 'svg';
    if (m.includes('json')) return 'json';
    if (m.includes('csv')) return 'csv';
    if (m.includes('markdown')) return 'markdown';
    return fallback;
}
