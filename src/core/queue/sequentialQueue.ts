import type pino from 'pino';

export interface SequentialQueueOptions {
  /**
   * Maximum number of items that may sit in the pending list at any time.
   * When exceeded, the oldest pending (not yet processing) item is dropped.
   * The currently-executing item is never dropped.
   */
  maxSize?: number;
  logger?: pino.Logger;
}

/**
 * Per-org FIFO queue that guarantees one message processed at a time.
 *
 * Sequentiality is intentional for v1 (README §11 / plan 07).
 * Items are processed in strict enqueue order via a single Promise chain.
 * A processor error is caught and logged at `error` level; the chain continues.
 *
 * Drop policy: when `maxSize` is set and the pending list is full, the oldest
 * pending item is dropped (not the currently-executing one).  This is
 * "drop-oldest" and keeps the queue bounded and predictable.
 */
export class SequentialQueue<T> {
  private readonly processor: (item: T) => Promise<void>;
  private readonly maxSize: number | undefined;
  private readonly logger: pino.Logger | undefined;

  /** Items waiting to be processed (excluding the currently-executing item). */
  private pending: T[] = [];

  /**
   * The end of the promise chain.  Every new task is appended here so that
   * execution is always strictly sequential.
   */
  private tail: Promise<void> = Promise.resolve();

  /** Whether the chain is currently running a processor call. */
  private running = false;

  constructor(
    processor: (item: T) => Promise<void>,
    opts?: SequentialQueueOptions,
  ) {
    this.processor = processor;
    this.maxSize = opts?.maxSize;
    this.logger = opts?.logger;
  }

  /**
   * Adds an item to the end of the queue.
   * If `maxSize` is configured and the pending list is full, the oldest
   * pending item is dropped before the new one is appended.
   */
  enqueue(item: T): void {
    if (this.maxSize !== undefined && this.pending.length >= this.maxSize) {
      this.pending.shift();
      this.logger?.warn(
        { maxSize: this.maxSize },
        `Queue maxSize (${this.maxSize}) exceeded — dropping oldest pending item`,
      );
    }

    this.pending.push(item);

    if (!this.running) {
      this.kick();
    }
  }

  /** Returns the number of items currently waiting in the pending list. */
  size(): number {
    return this.pending.length;
  }

  /**
   * Resolves once the current chain settles (all items enqueued so far have
   * been processed or errored out).
   */
  drain(): Promise<void> {
    return this.tail;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Eagerly shifts the first pending item out of the list (so it is not
   * counted by size() and cannot be evicted by the maxSize policy while
   * executing), then appends a step to the promise chain that processes it
   * and drains any items that arrive while it runs.
   */
  private kick(): void {
    this.running = true;

    // Synchronously remove the item from pending so size() is immediately
    // accurate and maxSize eviction cannot touch the in-flight item.
    // Non-null assertion safe: kick() is only called when pending.length > 0.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const first = this.pending.shift()!;

    this.tail = this.tail.then(async () => {
      await this.runItem(first);
      // Drain items that were enqueued while this item was executing.
      while (this.pending.length > 0) {
        // Non-null assertion safe: we just checked .length > 0.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await this.runItem(this.pending.shift()!);
      }
      this.running = false;
    });
  }

  private async runItem(item: T): Promise<void> {
    try {
      await this.processor(item);
    } catch (err) {
      this.logger?.error({ err }, 'Queue processor threw — continuing chain');
    }
  }
}
