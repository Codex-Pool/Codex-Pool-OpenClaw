type IteratorResultValue<TEvent> = IteratorResult<TEvent, undefined>;
type Waiter<TEvent> = (result: IteratorResultValue<TEvent>) => void;

export class EventStream<TEvent, TResult = unknown> {
  private readonly isComplete: (event: TEvent) => boolean;
  private readonly extractResult: (event: TEvent) => TResult;
  private readonly queue: TEvent[] = [];
  private readonly waiting: Array<Waiter<TEvent>> = [];
  private done = false;
  private resolveFinalResult!: (result: TResult | PromiseLike<TResult>) => void;
  private readonly finalResultPromise: Promise<TResult>;

  constructor(
    isComplete: (event: TEvent) => boolean,
    extractResult: (event: TEvent) => TResult
  ) {
    this.isComplete = isComplete;
    this.extractResult = extractResult;
    this.finalResultPromise = new Promise((resolve) => {
      this.resolveFinalResult = resolve;
    });
  }

  push(event: TEvent): void {
    if (this.done) {
      return;
    }

    if (this.isComplete(event)) {
      this.done = true;
      this.resolveFinalResult(this.extractResult(event));
    }

    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  end(result?: TResult): void {
    this.done = true;

    if (result !== undefined) {
      this.resolveFinalResult(result);
    }

    while (this.waiting.length > 0) {
      const waiter = this.waiting.shift();
      waiter?.({ value: undefined, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<TEvent, void, void> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift() as TEvent;
      } else if (this.done) {
        return;
      } else {
        const result = await new Promise<IteratorResultValue<TEvent>>(
          (resolve) => {
            this.waiting.push(resolve);
          }
        );
        if (result.done) {
          return;
        }
        yield result.value;
      }
    }
  }

  result(): Promise<TResult> {
    return this.finalResultPromise;
  }
}

type AssistantMessageEvent = {
  type: string;
  message?: unknown;
  error?: unknown;
  [key: string]: unknown;
};

export class AssistantMessageEventStream extends EventStream<
  AssistantMessageEvent,
  unknown
> {
  constructor() {
    super(
      (event) => event.type === "done" || event.type === "error",
      (event) => {
        if (event.type === "done") {
          return event.message;
        }

        return "error" in event ? event.error : undefined;
      }
    );
  }
}
