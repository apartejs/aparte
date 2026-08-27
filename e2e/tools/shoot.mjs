/*
 * shoot.mjs — screenshots of the BUILT docs site, as PNG files.
 *
 * The docs site renders every component for real, in an iframe, so the only way to
 * check that a page actually looks right is to look at it. This serves `apps/docs/dist`
 * and photographs it.
 *
 *   node e2e/tools/shoot.mjs <dist> <outDir> [target ...]
 *
 * A target is  route[@width][#selector][:theme]
 *   /preview/aparte-composer/                  the preview document on its own
 *   /components/input/aparte-composer/#iframe  the preview BOX as it sits in the page
 *   /reference/events/@375#table               one table, at phone width
 *   /guides/theming/@375:dark
 *
 * With no target it shoots every /preview/* route — what the iframes really contain.
 * Build first: `pnpm --filter @aparte-workspace/docs build`.
 *
 * On Git Bash, prefix with MSYS_NO_PATHCONV=1 or a leading `/` is rewritten to a
 * Windows path before Node ever sees it.
 */
import { chromium } from '@playwright/test';
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const [DIST, OUT, ...targets] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json', '.webp': 'image/webp', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
    let f = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
    if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!existsSync(f)) { res.writeHead(404); res.end(''); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
});
const PORT = 4380 + Math.floor(process.pid % 15);
await new Promise((r) => server.listen(PORT, r));

function routes(dir, base = '', out = []) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (e.name !== '_astro') routes(path.join(dir, e.name), base + '/' + e.name, out); }
        else if (e.name === 'index.html') out.push(base + '/');
    }
    return out;
}
if (!targets.length) targets.push(...routes(DIST).filter((r) => r.startsWith('/preview/')).sort());

const browser = await chromium.launch();
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70) || 'page';

for (const t of targets) {
    const m = t.match(/^([^@#:]+)(?:@(\d+))?(?:#([^:]+))?(?::(light|dark))?$/);
    if (!m) { console.log('cible illisible:', t); continue; }
    const [, route, w, sel, theme] = m;
    const width = Number(w || 1280);
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    // eslint-disable-next-line no-undef -- runs in the page, not in Node
    if (theme) await ctx.addInitScript((x) => { try { localStorage.setItem('starlight-theme', x); } catch { /* private mode: the theme stays default */ } }, theme);
    const page = await ctx.newPage();
    await page.goto('http://localhost:' + PORT + route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(600);
    const name = slug(route + (w ? '-' + w : '') + (sel ? '-' + sel : '') + (theme ? '-' + theme : ''));
    const file = path.join(OUT, name + '.png');
    let ok = true;
    if (sel) {
        const loc = page.locator(sel === 'iframe' ? '.aparte-preview, aparte-preview, iframe' : sel).first();
        ok = await loc.screenshot({ path: file }).then(() => true).catch((e) => { console.log('  !! ' + sel + ' : ' + String(e).split('\n')[0].slice(0, 80)); return false; });
    } else {
        await page.screenshot({ path: file, fullPage: true });
    }
    if (ok) {
        // eslint-disable-next-line no-undef -- runs in the page, not in Node
        const h = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => 0);
        console.log(String(route + (w ? ' @' + w : '') + (theme ? ' ' + theme : '')).padEnd(52) + '-> ' + name + '.png   (page ' + h + 'px)');
    }
    await ctx.close();
}
await browser.close();
server.close();
