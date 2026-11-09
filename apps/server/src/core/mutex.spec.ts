import { describe, expect, it } from 'vitest';
import { Mutex } from './mutex';

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('Mutex', () => {
  it('runs tasks one at a time in FIFO order', async () => {
    const m = new Mutex();
    const events: string[] = [];
    const task = (id: string) => async () => {
      events.push(`start ${id}`);
      await tick();
      events.push(`end ${id}`);
      return id;
    };
    await expect(Promise.all([m.run(task('a')), m.run(task('b')), m.run(task('c'))])).resolves.toEqual(['a', 'b', 'c']);
    expect(events).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('keeps going after a task fails', async () => {
    const m = new Mutex();
    const failed = m.run(async () => {
      throw new Error('boom');
    });
    await expect(failed).rejects.toThrow('boom');
    await expect(m.run(async () => 'next')).resolves.toBe('next');
  });
});
