import { describe, it, expect, vi } from 'vitest';
import { SequentialQueue } from './sequentialQueue.js';

/** Returns a processor that records execution order and optionally delays. */
function makeRecorder(
  log: number[],
  delayMs = 0,
): (item: number) => Promise<void> {
  return async (item) => {
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
    log.push(item);
  };
}

describe('SequentialQueue', () => {
  it('executes items in strict FIFO order', async () => {
    const order: number[] = [];
    const q = new SequentialQueue<number>(makeRecorder(order));

    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    q.enqueue(4);
    q.enqueue(5);

    await q.drain();

    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('processes exactly one item at a time (sequential, not concurrent)', async () => {
    const active: number[] = [];
    const maxConcurrent: number[] = [];

    const processor = async (item: number) => {
      active.push(item);
      maxConcurrent.push(active.length);
      // Simulate async work
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      active.splice(active.indexOf(item), 1);
    };

    const q = new SequentialQueue<number>(processor);
    for (let i = 1; i <= 5; i++) q.enqueue(i);
    await q.drain();

    // Concurrent count must never exceed 1
    expect(Math.max(...maxConcurrent)).toBe(1);
  });

  it('processor throws on item 2 → items 3, 4, 5 still execute', async () => {
    const order: number[] = [];
    const errorLogger = { error: vi.fn(), warn: vi.fn() } as unknown as import('pino').Logger;

    const processor = async (item: number) => {
      if (item === 2) throw new Error('boom');
      order.push(item);
    };

    const q = new SequentialQueue<number>(processor, { logger: errorLogger });
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    q.enqueue(4);
    q.enqueue(5);

    await q.drain();

    // Item 2 threw but the chain continued
    expect(order).toEqual([1, 3, 4, 5]);
    expect(errorLogger.error).toHaveBeenCalledOnce();
  });

  it('drain() resolves after the last item completes', async () => {
    const finished: number[] = [];
    const q = new SequentialQueue<number>(makeRecorder(finished, 10));

    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);

    await q.drain();

    expect(finished).toHaveLength(3);
  });

  it('drain() resolves immediately when queue is empty', async () => {
    const q = new SequentialQueue<number>(makeRecorder([]));
    await expect(q.drain()).resolves.toBeUndefined();
  });

  it('size() returns the number of pending items', () => {
    let resolve!: () => void;
    // Processor that blocks until we release it
    const blocker = new Promise<void>((r) => { resolve = r; });
    const processor = async (_item: number) => { await blocker; };

    const q = new SequentialQueue<number>(processor);
    q.enqueue(1); // starts executing immediately (pending → 0 after shift)
    q.enqueue(2); // queued
    q.enqueue(3); // queued

    // Item 1 is being processed; items 2 & 3 are pending
    expect(q.size()).toBe(2);

    resolve(); // unblock
  });

  it('with maxSize: 2 — enqueue 5 items while processor is slow → only 2 retained', async () => {
    const processed: number[] = [];
    const warnLogger = { warn: vi.fn(), error: vi.fn() } as unknown as import('pino').Logger;

    // Slow processor so items pile up before any are consumed
    const processor = async (item: number) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      processed.push(item);
    };

    const q = new SequentialQueue<number>(processor, {
      maxSize: 2,
      logger: warnLogger,
    });

    // Enqueue 5 items synchronously.  Item 1 starts executing immediately.
    // Items 2 & 3 fill the pending list to maxSize (2).
    // Item 4: drops item 2 (oldest), pending = [3, 4].
    // Item 5: drops item 3 (oldest), pending = [4, 5].
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    q.enqueue(4);
    q.enqueue(5);

    await q.drain();

    // Item 1 was executing when items 4+5 were enqueued, so it always runs.
    // Of the pending items only the newest 2 survive: 4 and 5.
    expect(processed).toEqual([1, 4, 5]);
    // Warn called twice (once for each dropped item: 2 and 3)
    expect(warnLogger.warn).toHaveBeenCalledTimes(2);
  });

  it('items enqueued after drain() still execute', async () => {
    const order: number[] = [];
    const q = new SequentialQueue<number>(makeRecorder(order));

    q.enqueue(1);
    await q.drain();

    q.enqueue(2);
    await q.drain();

    expect(order).toEqual([1, 2]);
  });
});
