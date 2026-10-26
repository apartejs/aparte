/**
 * The two stylesheets: `theme.css`, the n8n theme alone (for a chat you compose), and
 * `style.css`, aparté's stylesheet followed by the theme — the one `<link>` a page needs,
 * as n8n's widget needs one.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const theme = resolve(pkg, 'src/theme.css');
const core = createRequire(resolve(pkg, 'package.json')).resolve('@aparte/core/styles.css');

copyFileSync(theme, resolve(pkg, 'dist/theme.css'));
writeFileSync(
    resolve(pkg, 'dist/style.css'),
    `${readFileSync(core, 'utf8').trimEnd()}\n\n${readFileSync(theme, 'utf8')}`,
);
console.log('[n8n-chat] dist/style.css = @aparte/core/styles.css + theme.css');
