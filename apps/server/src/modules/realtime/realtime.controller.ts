import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { EventBus } from '../../core/redis/event-bus';

@Controller()
export class RealtimeController {
  constructor(private readonly bus: EventBus) {}

  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.bus.stream().pipe(map((event) => ({ data: event })));
  }
}
