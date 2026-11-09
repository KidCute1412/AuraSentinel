/** Minimal FIFO mutex: each task starts after the previous one settles (success or failure). */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => task());
    this.tail = result.catch(() => undefined);
    return result;
  }
}
