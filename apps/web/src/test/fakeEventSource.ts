/** Minimal EventSource stand-in (jsdom has none). Tests drive it with open/message/fail. */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static reset() {
    FakeEventSource.instances = [];
  }
  static get last(): FakeEventSource {
    const es = FakeEventSource.instances.at(-1);
    if (!es) throw new Error("no EventSource created");
    return es;
  }

  readonly url: string;
  readonly withCredentials: boolean;
  closed = false;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = Boolean(init?.withCredentials);
    FakeEventSource.instances.push(this);
  }

  open() {
    this.onopen?.(new Event("open"));
  }
  message(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: typeof data === "string" ? data : JSON.stringify(data) }));
  }
  fail() {
    this.onerror?.(new Event("error"));
  }
  close() {
    this.closed = true;
  }
}
