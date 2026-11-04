import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Controller, HttpCode, Param, Post } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { QUEUES } from '../../core/queue/queue.constants';
import { SCENARIOS } from './scenarios';

@Controller('attacks')
export class RedteamController {
  constructor(@InjectQueue(QUEUES.attack) private readonly queue: Queue) {}

  @Post(':scenario')
  @HttpCode(202)
  async launch(@Param('scenario') scenario: string) {
    if (!(scenario in SCENARIOS)) throw new BadRequestException(`unknown scenario: ${scenario}`);
    await this.queue.add(scenario, { scenario });
    return { queued: true, scenario };
  }
}
