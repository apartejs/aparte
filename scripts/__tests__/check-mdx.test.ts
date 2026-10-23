/**
 * An MDX page that cannot render is caught in seconds, not at the docs build.
 *
 * The case this exists for: a guide wrote `{name}` in its prose. MDX reads a brace as an
 * expression, the page compiled, and the build failed when it rendered — `name` exists on no
 * page — ten minutes into the gate.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkMdxText, mdxFiles } from '../check-mdx.mjs';

describe('the pages it reads', () => {
    it('reads a new page before it is added, and skips one deleted before git heard of it', () => {
        // A page written and checked before `git add` was skipped (the build failed on it
        // minutes later), and one deleted in the editor crashed the step on a missing file.
        const root = mkdtempSync(join(tmpdir(), 'aparte-mdx-'));
        try {
            const docs = join(root, 'docs');
            mkdirSync(docs);
            execFileSync('git', ['init', '-q'], { cwd: root });
            writeFileSync(join(docs, 'kept.mdx'), '# Kept\n');
            writeFileSync(join(docs, 'deleted.mdx'), '# Deleted\n');
            execFileSync('git', ['add', '.'], { cwd: root });
            rmSync(join(docs, 'deleted.mdx'));
            writeFileSync(join(docs, 'new.mdx'), '# New\n');
            // A generated page a build left on disk stays out, as before.
            writeFileSync(join(root, '.gitignore'), 'docs/generated.mdx\n');
            writeFileSync(join(docs, 'generated.mdx'), '# Generated\n');
            const names = mdxFiles(docs, root).map((f: string) => f.slice(docs.length + 1)).sort();
            expect(names).toEqual(['kept.mdx', 'new.mdx']);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('checkMdxText', () => {
    it('refuses a brace in prose that names nothing on the page', () => {
        const problems = checkMdxText('The bubble reads {name} from the message.\n');
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/^1:\d+ `\{name\}` names nothing/);
    });

    it('refuses a page that does not parse, with where', () => {
        expect(checkMdxText('---\ntitle: T\n---\n\nAn unclosed <Tabs> here.\n')[0]).toMatch(/^5:\d+ does not parse as MDX/);
    });

    it('accepts what a page declares, what MDX provides, comments, and code', () => {
        const page = [
            '---',
            'title: The <AparteChat> component',
            'description: { not: an expression }',
            '---',
            "import { Tabs, TabItem } from '@astrojs/starlight/components';",
            "export const sizes = ['sm'];",
            '',
            '{/* a comment */}',
            '',
            '<Tabs syncKey={sizes}><TabItem label="A">{frontmatter.title}</TabItem></Tabs>',
            '',
            'Inline `{name}` is code, and so is:',
            '',
            '```ts',
            'const x = { name };',
            '```',
            '',
            'A computed one is left to the build: {sizes.map((s) => s.toUpperCase())}.',
            '',
        ].join('\n');
        expect(checkMdxText(page)).toEqual([]);
    });

    it('reads a name inside a JSX attribute too', () => {
        expect(checkMdxText('<Badge text={label} />\n').join()).toMatch(/`\{label\}` names nothing/);
    });
});
