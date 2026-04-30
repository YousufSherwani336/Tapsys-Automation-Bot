import { describe, it, expect } from 'vitest';
import { assertToolsAllowed } from './assertToolsAllowed.js';

describe('assertToolsAllowed', () => {
  it('does not throw when all requested tools are available', () => {
    expect(() => assertToolsAllowed(['y'], ['x', 'y'])).not.toThrow();
  });

  it('does not throw for an empty requested list', () => {
    expect(() => assertToolsAllowed([], ['x', 'y'])).not.toThrow();
  });

  it('throws when a requested tool is not in the available set', () => {
    expect(() => assertToolsAllowed(['x'], ['y'])).toThrow(/x/);
  });

  it('lists all offending tool names in the error message', () => {
    expect(() => assertToolsAllowed(['a', 'b', 'c'], ['b'])).toThrowError(
      /a.*c|c.*a/,
    );
  });

  it('throws for a single missing tool', () => {
    expect(() => assertToolsAllowed(['missing'], [])).toThrow(/missing/);
  });
});
