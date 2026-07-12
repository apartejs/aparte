/**
 * Strip CSS side-effect imports (`import './x.css';`) that tsc leaves in the
 * emitted .d.ts files. Those `.css` files are bundled into dist/index.css and
 * are NOT shipped as standalone files, so the imports resolve to nothing —
 * which trips `@arethetypeswrong/cli` (InternalResolutionError). Consumers of
 * the types never need them. We blank the line (keep the newline) so the
 * accompanying .d.ts.map line numbers stay aligned.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const CSS_IMPORT = /^[ \t]*import\s+['"][^'"]+\.css['"];?[ \t]*$/gm;

let cleaned = 0;
function walk(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.d.ts')) {
            const src = readFileSync(full, 'utf8');
            const out = src.replace(CSS_IMPORT, '');
            if (out !== src) {
                writeFileSync(full, out);
                cleaned++;
            }
        }
    }
}

try {
    walk(distDir);
    console.log(`[clean-declarations] stripped CSS imports from ${cleaned} .d.ts file(s)`);
} catch (err) {
    console.error('[clean-declarations] failed:', err.message);
    process.exit(1);
}
