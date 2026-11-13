import type { INestApplication } from '@nestjs/common';
import type { Express, NextFunction, Request, Response } from 'express';
import { ProblemFilter } from './problem.filter';

/** Helmet-equivalent headers for a JSON API (A9), without the dependency. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // JSON and SSE only: nothing here should ever render as a page.
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

/**
 * HTTP setup shared by main.api.ts and the e2e test, so tests exercise the exact production
 * routing: every route under /api/v1 (api.md §1, the SPA owns bare paths) except the
 * unversioned health check, every error as problem+json, security headers, and CORS only for
 * the origins in CORS_ORIGINS (prod is same-origin behind nginx, so none by default).
 */
export function configureApi(app: INestApplication, opts: { corsOrigins?: readonly string[] } = {}): INestApplication {
  const express = app.getHttpAdapter().getInstance() as Express;
  express.disable('x-powered-by');
  // Behind nginx (compose) or the Vite proxy: trust private-network hops so req.ip is the real
  // client, which the per-IP write limit depends on. Public addresses are never trusted.
  express.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    next();
  });

  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalFilters(new ProblemFilter());
  if (opts.corsOrigins?.length) {
    app.enableCors({ origin: [...opts.corsOrigins], credentials: true, exposedHeaders: ['Location', 'Retry-After'] });
  }
  return app;
}
