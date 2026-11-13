import { PROBLEM_CONTENT_TYPE, problem } from '@agentshield/shared';
import type { INestApplication } from '@nestjs/common';
import type { Express, NextFunction, Request, Response } from 'express';
import { ProblemFilter } from './core/http/problem.filter';
import { OwnershipService } from './modules/auth/ownership.service';
import { SessionService } from './modules/auth/session.service';

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

  // Bull Board (job retry/delete/clean) is an Express app mounted by its own module, and it ends
  // up under the global prefix (/api/v1/admin/queues), which nginx proxies. Guard every path it
  // can answer on, here, before it registers: admins only.
  const sessions = app.get(SessionService, { strict: false });
  const ownership = app.get(OwnershipService, { strict: false });
  app.use(['/admin/queues', '/api/v1/admin/queues'], (req: Request, res: Response, next: NextFunction) => {
    const address = sessions.address(req);
    if (address && ownership.isAdmin(address)) return next();
    const p = address ? problem('NOT_ADMIN', 'Admins only') : problem('UNAUTHENTICATED', 'Sign in with an admin wallet');
    res.status(p.status).type(PROBLEM_CONTENT_TYPE).json(p);
  });

  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalFilters(new ProblemFilter());
  if (opts.corsOrigins?.length) {
    app.enableCors({ origin: [...opts.corsOrigins], credentials: true, exposedHeaders: ['Location', 'Retry-After'] });
  }
  return app;
}
