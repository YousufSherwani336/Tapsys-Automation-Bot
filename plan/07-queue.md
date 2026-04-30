# Plan 07: Sequential in-memory queue

**TL;DR** Per-org FIFO queue: one message processed at a time through (normalize → handler → send). Sequential is intentional for v1 ([README §11](../README-v2.md)).

**Depends on**: [Plan 06](06-whatsapp.md).

## Steps

1. `src/core/queue/sequentialQueue.ts`:
   - `class SequentialQueue<T>`:
     - Constructor: `(processor: (item: T) => Promise<void>, opts?: { maxSize?: number; logger?: pino.Logger })`.
     - `enqueue(item: T): void` — appends; if a processor is not running, kicks off the chain.
     - Internal: a single `Promise` chain (`this.tail = this.tail.then(...)`) ensuring strict FIFO.
     - Errors inside `processor` are caught, logged at `error` level, and do NOT halt the chain.
     - If `maxSize` is set and exceeded, log a warning and drop the oldest queued item (or reject — choose drop-oldest and document it; this matches the "predictable" goal).
     - `size(): number`, `drain(): Promise<void>` (resolves when current chain settles).
2. Wire a smoke harness (in tests, not production code): WA `onMessage` → `queue.enqueue` → processor that echoes the text back via `sendText`.

## Files created

- `src/core/queue/sequentialQueue.ts`

## Verification

1. Unit test: enqueue 5 items with a processor that records order + sleeps; assert strictly sequential execution and ordered completion.
2. Test: processor throws on item 2 → items 3, 4, 5 still execute; thrown error is logged.
3. Test: `drain()` resolves after the last item completes.
4. Test (with `maxSize: 2`): enqueue 5 items synchronously while processor is slow → only the most recent 2 are retained per the documented drop policy.
5. Manual: spam 3 WhatsApp messages back-to-back, observe sequential replies (no interleaving).

## Out of scope

Pi integration (plan 10 wires it into the bootstrap).
