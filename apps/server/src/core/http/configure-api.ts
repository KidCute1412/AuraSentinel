import type { INestApplication } from '@nestjs/common';
import { ProblemFilter } from './problem.filter';

/**
 * HTTP setup shared by main.api.ts and the e2e test, so tests exercise the exact production
 * routing: every route under /api/v1 (api.md §1, the SPA owns bare paths) except the
 * unversioned health check, and every error as problem+json.
 */
export function configureApi(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalFilters(new ProblemFilter());
  app.enableCors();
  return app;
}
