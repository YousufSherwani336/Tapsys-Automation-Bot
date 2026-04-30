/**
 * Asserts that every requested tool name is present in the available set.
 * Throws with a clear message listing all offending names if any are missing.
 *
 * Use this at startup to enforce the allowlist model: tools are exposed only
 * if they appear in the org manifest (README §9.3).
 */
export function assertToolsAllowed(
  requested: string[],
  available: string[],
): void {
  const availableSet = new Set(available);
  const offenders = requested.filter((name) => !availableSet.has(name));
  if (offenders.length > 0) {
    throw new Error(
      `Requested tool(s) not in the available set: ${offenders.join(', ')}`,
    );
  }
}
