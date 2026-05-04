/**
 * In-memory store for large SQL query results.
 * Instead of passing thousands of rows through the LLM context,
 * tools store results here and exchange a lightweight reference ID.
 * 
 * Results auto-expire after 10 minutes to prevent memory leaks.
 */

const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface StoredResult {
  rows: Record<string, unknown>[];
  columns: string[];
  storedAt: number;
}

const store = new Map<string, StoredResult>();

let nextId = 1;

function generateRef(): string {
  return `sqlref_${nextId++}_${Date.now()}`;
}

/** Store rows and return a reference ID. */
export function storeResult(rows: Record<string, unknown>[], columns: string[]): string {
  cleanup();
  const ref = generateRef();
  store.set(ref, { rows, columns, storedAt: Date.now() });
  return ref;
}

/** Retrieve stored rows by reference ID. Returns null if expired or not found. */
export function getStoredResult(ref: string): { rows: Record<string, unknown>[]; columns: string[] } | null {
  const entry = store.get(ref);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > EXPIRY_MS) {
    store.delete(ref);
    return null;
  }
  return { rows: entry.rows, columns: entry.columns };
}

/** Remove expired entries. */
function cleanup(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.storedAt > EXPIRY_MS) {
      store.delete(key);
    }
  }
}
