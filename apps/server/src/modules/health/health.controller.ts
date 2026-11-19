import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

/**
 * GET /api/health (api.md #18, unversioned): Docker healthcheck, smoke test, uptime.
 * 503 when Postgres or Redis is down; RPC and worker only degrade the status.
 */
@Controller('api/health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const report = await this.health.check();
    res.status(report.status === 'down' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK);
    return report;
  }
}
