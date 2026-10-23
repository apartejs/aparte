#!/usr/bin/env node
/**
 * Every MDX page parses, and every `{expression}` in it names something the page has.
 *
 * An MDX mistake used to surface at the docs build, minutes into the gate: a brace in prose
 * (`{name}` written as text) compiles as an expression and fails when the page renders,
 * because nothing called `name` exists; an unbalanced brace or a bare `<tag>` fails the
 * parse. Both are a property of one file's text, so this reads each `.mdx` under the docs
 * content in a few seconds, before anything is built:
 *
 *   • the file must PARSE as MDX (the same parser the site uses, `@mdx-js/mdx`);
 *   • an expression that is a plain name or a member chain (`{name}`, `{a.b}`) must start
 *     from a name the page imports or exports, or one MDX provides (`props`, `frontmatter`).
 *
 * Anything richer than a name — a call, a template, an arrow — is left alone: it is code
 * someone wrote on purpose, and the build is where it gets evaluated.
 *
 * Run by `pnpm gate` with the other source checks, before the build.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'apps/docs/src/content/docs');
/** A walk that finds almost nothing passes for the wrong reason. */
const MIN_FILES = 40;
/** What MDX puts in scope for every page, beside what the page imports or exports. */
const PROVIDED = new Set(['props', 'frontmatter', 'Astro']);

const { createProcessor } = await import(
    pathToFileURL(createRequire(join(ROOT, 'apps/docs/package.json')).resolve('@mdx-js/mdx')).href
);
const processor = createProcessor({ format: 'mdx' });

/** The names a page declares: its imports' local names and its exported bindings. */
function declared(tree) {
    const names = new Set();
    const visit = (node) => {
        if (node.type === 'mdxjsEsm') {
            for (const stmt of node.data?.estree?.body ?? []) {
                for (const spec of stmt.specifiers ?? []) names.add(spec.local.name);
                for (const decl of stmt.declaration?.declarations ?? []) if (decl.id?.name) names.add(decl.id.name);
                if (stmt.declaration?.id?.name) names.add(stmt.declaration.id.name);
            }
        }
        for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
    return names;
}

/** The root name of `{name}` or `{a.b.c}`, or null when the expression is anything else. */
function rootName(estree) {
    const body = estree?.body ?? [];
    if (body.length !== 1 || body[0].type !== 'ExpressionStatement') return null;
    let expr = body[0].expression;
    while (expr.type === 'MemberExpression') expr = expr.object;
    return expr.type === 'Identifier' ? expr.name : null;
}

/** Problems in one page's text, each as `line:col message`. */
export function checkMdxText(text) {
    // The frontmatter is YAML, which the site strips before MDX sees the page. Blanked rather
    // than cut, so a line number still points at the line in the file.
    const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/, (fm) => fm.replace(/[^\n]/g, ''));
    let tree;
    try {
        tree = processor.parse(body);
    } catch (error) {
        const at = error.place?.start ?? error.place ?? {};
        return [`${at.line ?? '?'}:${at.column ?? '?'} does not parse as MDX: ${error.reason ?? error.message}`];
    }
    const names = declared(tree);
    const problems = [];
    const visit = (node) => {
        const estrees = [];
        if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') estrees.push(node.data?.estree);
        for (const attr of node.attributes ?? []) {
            if (attr.value?.type === 'mdxJsxAttributeValueExpression') estrees.push(attr.value.data?.estree);
        }
        for (const estree of estrees) {
            const name = rootName(estree);
            if (name && !names.has(name) && !PROVIDED.has(name)) {
                const at = node.position?.start ?? {};
                problems.push(`${at.line}:${at.column} \`{${name}}\` names nothing on this page — prose? write \\{ or put it in backticks`);
            }
        }
        for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
    return problems;
}

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, out);
        else if (name.endsWith('.mdx')) out.push(path);
    }
    return out;
}

/**
 * The pages written by hand: the ones git tracks, and a new one not added yet. The generated
 * pages a previous build left on disk are gitignored: reading them made a local run check a
 * corpus CI never sees (a stale generator output could fail here before the build that
 * replaces it). A tracked page deleted on disk is still in the index, so only what exists is
 * read. Outside a checkout, the walk of the folder.
 */
export function mdxFiles(dir, root = ROOT) {
    try {
        const listed = execFileSync(
            'git',
            ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', relative(root, dir).split(sep).join('/')],
            { cwd: root, encoding: 'utf8' },
        );
        return listed.split('\0').filter((f) => f.endsWith('.mdx')).map((f) => join(root, f)).filter((f) => existsSync(f));
    } catch {
        return walk(dir);
    }
}

function main() {
    const files = mdxFiles(CONTENT);
    if (files.length < MIN_FILES) {
        console.error(`[mdx] FAIL: found ${files.length} .mdx file(s) under ${relative(ROOT, CONTENT)}, expected at least ${MIN_FILES}.`);
        process.exit(1);
    }
    const failures = [];
    for (const file of files) {
        for (const problem of checkMdxText(readFileSync(file, 'utf8'))) {
            failures.push(`${relative(ROOT, file).split(sep).join('/')}:${problem}`);
        }
    }
    if (failures.length) {
        console.error(`\n[mdx] ${failures.length} problem(s):\n`);
        for (const f of failures) console.error(`  ${f}`);
        console.error('');
        process.exit(1);
    }
    console.log(`[mdx] OK: ${files.length} pages parse, and every bare {name} in them is declared.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
