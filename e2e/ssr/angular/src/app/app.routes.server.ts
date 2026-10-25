import { RenderMode, type ServerRoute } from '@angular/ssr';

// Rendered on every request: what the spec reads is a server render, not a prerendered file.
export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Server }];
