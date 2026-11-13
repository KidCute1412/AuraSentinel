import { Controller, Get, Header } from '@nestjs/common';
import { ProofService } from './proof.service';

/** GET /proof (api.md #14). Public, cached 30 s server side and by the browser. */
@Controller('proof')
export class ProofController {
  constructor(private readonly proof: ProofService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=30')
  get() {
    return this.proof.get();
  }
}
