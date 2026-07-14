/*
 * Generates the @aparte/engine API reference (reference/engine.md) from the
 * package's TypeScript source + JSDoc via TypeDoc (typedoc-plugin-markdown, a
 * single-file "modules" strategy). Runs before `astro dev` / `astro build` like
 * the other gen scripts. Mirrors gen-api-ref.mjs: generate, then wrap with
 * Starlight frontmatter + an auto-generated banner. Never edit the output by hand.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(here, '..');
const OUT_DIR = resolve(docsRoot, 'src/content/docs/reference/engine');
const REF_DIR = resolve(docsRoot, 'src/content/docs/reference');
const OUT = resolve(REF_DIR, 'engine.md');

// 1. Clean + run TypeDoc (writes OUT_DIR/README.md).
rmSync(OUT_DIR, { recursive: true, force: true });
try {
    execSync('npx --no-install typedoc --options typedoc.engine.json', { cwd: docsRoot, stdio: 'pipe' });
} catch (err) {
    // TypeDoc exits non-zero only on real errors (warnings are fine); surface them.
    process.stderr.write(err.stdout?.toString?.() ?? '');
    process.stderr.write(err.stderr?.toString?.() ?? '');
    throw err;
}

const generated = resolve(OUT_DIR, 'README.md');
if (!existsSync(generated)) {
    throw new Error(`[gen-engine-api] TypeDoc produced no README.md in ${OUT_DIR}`);
}

// 2. Flatten to a single reference/engine.md with Starlight frontmatter.
let md = readFileSync(generated, 'utf8').replace(/^#\s+.*\n+/, ''); // drop the leading H1 (title comes from frontmatter)
rmSync(OUT_DIR, { recursive: true, force: true });
if (!existsSync(REF_DIR)) mkdirSync(REF_DIR, { recursive: true });

const front = `---
title: "@aparte/engine — API reference"
description: Generated reference for @aparte/engine — runStreamAgent, its stream events, the artifact-XML parser, and the conversation compactor.
sidebar:
  order: 3
---

<!-- AUTO-GENERATED from packages/engine/src (TypeDoc) by apps/docs/scripts/gen-engine-api.mjs — do not edit by hand. Run \`pnpm --filter @aparte-workspace/docs gen:engine-api\` to refresh. -->\n

`;
writeFileSync(OUT, front + md);
console.log(`[gen-engine-api] wrote ${OUT}`);
