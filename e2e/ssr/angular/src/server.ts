import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from '@angular/ssr/node';
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const browserDistFolder = join(dirname(fileURLToPath(import.meta.url)), '../browser');

const app = express();
// Angular 21 renders only for the hosts it is told about, and falls back to a client render for
// any other — which would make the spec's server-render checks pass on no server render at all.
const angularApp = new AngularNodeAppEngine({ allowedHosts: ['localhost'] });

app.use(express.static(browserDistFolder, { maxAge: '1y', index: false, redirect: false }));

app.use((req, res, next) => {
    angularApp
        .handle(req)
        .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
        .catch(next);
});

if (isMainModule(import.meta.url)) {
    const port = process.env['PORT'] || 4000;
    app.listen(port, () => {
        console.log(`Listening on http://localhost:${port}`);
    });
}

export const reqHandler = createNodeRequestHandler(app);
