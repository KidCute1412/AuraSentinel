import { Address, problem } from '@agentshield/shared';
import { BadRequestException, Controller, MessageEvent, Param, Sse } from '@nestjs/common';
import { filter, map, Observable } from 'rxjs';
import { EventBus } from '../../core/redis/event-bus';

/** GET /vaults/{safe}/events (api.md #13): SSE of the ServerEvents of one vault. */
@Controller('vaults/:safe/events')
export class RealtimeController {
  constructor(private readonly bus: EventBus) {}

  @Sse()
  events(@Param('safe') rawSafe: string): Observable<MessageEvent> {
    const safe = Address.safeParse(rawSafe);
    if (!safe.success) throw new BadRequestException(problem('VALIDATION_ERROR', 'Invalid vault address', rawSafe));
    const vault = safe.data.toLowerCase();
    return this.bus.stream().pipe(
      filter((event) => event.vault.toLowerCase() === vault),
      map((event) => ({ data: event })),
    );
  }
}
