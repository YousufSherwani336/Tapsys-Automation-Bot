import type { ToolDefinition } from '../../types/index.js';

/**
 * Tool names that must never be registered for a business agent.
 * This is the authoritative list per README §2.4 and §10.4.
 * Any tool whose name appears here will be rejected at registration time.
 */
export const BLOCKED_TOOL_NAMES = new Set([
  'read',
  'write',
  'edit',
  'bash',
  'shell',
  'grep',
  'find',
  'glob',
  'exec',
  'spawn',
]);

/**
 * Registry for tools that will be passed to the Pi agent session.
 * Only registered tools are visible to Pi — unknown names are rejected at
 * startup (fail-closed model, README §9.3).
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  /**
   * Register a tool.
   * Throws if the name is on the blocked list or has already been registered.
   */
  register(tool: ToolDefinition): void {
    if (BLOCKED_TOOL_NAMES.has(tool.name)) {
      throw new Error(
        `Tool name "${tool.name}" is blocked (coding-tool ban — README §2.4).`,
      );
    }
    if (this.tools.has(tool.name)) {
      throw new Error(
        `Tool "${tool.name}" is already registered. Duplicate tool names are not allowed.`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  /** Returns all registered tools in insertion order. */
  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** Returns the tool with the given name, or undefined if not found. */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Returns the names of all registered tools. */
  names(): string[] {
    return [...this.tools.keys()];
  }
}
