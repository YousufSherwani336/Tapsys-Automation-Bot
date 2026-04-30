import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, BLOCKED_TOOL_NAMES } from './toolRegistry.js';
import type { ToolDefinition } from '../../types/index.js';

function makeTool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    inputSchema: z.object({ value: z.string() }),
    handler: async (input) => input,
  };
}

describe('ToolRegistry', () => {
  it('registers a tool and lists it', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('echo'));
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]!.name).toBe('echo');
  });

  it('get() returns the registered tool by name', () => {
    const registry = new ToolRegistry();
    const tool = makeTool('echo');
    registry.register(tool);
    expect(registry.get('echo')).toBe(tool);
  });

  it('get() returns undefined for unknown name', () => {
    const registry = new ToolRegistry();
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('names() returns registered tool names', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('alpha'));
    registry.register(makeTool('beta'));
    expect(registry.names()).toEqual(['alpha', 'beta']);
  });

  it('throws when registering a blocked tool name', () => {
    const registry = new ToolRegistry();
    for (const blocked of BLOCKED_TOOL_NAMES) {
      expect(() => registry.register(makeTool(blocked))).toThrow(
        /blocked/,
      );
    }
  });

  it('throws specifically for "bash"', () => {
    const registry = new ToolRegistry();
    expect(() => registry.register(makeTool('bash'))).toThrowError(
      /bash.*blocked|blocked.*bash/i,
    );
  });

  it('throws when registering the same name twice', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('echo'));
    expect(() => registry.register(makeTool('echo'))).toThrow(
      /already registered/,
    );
  });

  it('list() is independent of the internal map (snapshot)', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('echo'));
    const snapshot = registry.list();
    registry.register(makeTool('another'));
    expect(snapshot).toHaveLength(1);
  });
});
