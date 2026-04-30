/**
 * createAgent tests — Pi SDK is fully mocked so no real network calls are made.
 * Verification items from plan 05:
 *   5. Smoke test: createAgent({ systemPrompt, tools: [echoTool] }) →
 *      agent.sendMessage('hi') returns a string.
 *   6. Blocked tool name passed directly to createAgent throws.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { ToolDefinition } from '../../types/index.js';

// ── Mock @mariozechner/pi-agent-core ────────────────────────────────────────
// The Agent class is mocked to record prompts and inject a canned assistant
// response so sendMessage() can return a string without a real LLM call.
vi.mock('@mariozechner/pi-agent-core', () => {
  class MockAgent {
    state: {
      systemPrompt: string;
      model: unknown;
      tools: unknown[];
      messages: { role: string; content: { type: string; text: string }[] }[];
    };

    constructor(options: {
      initialState: {
        systemPrompt: string;
        model: unknown;
        tools: unknown[];
      };
    }) {
      this.state = {
        systemPrompt: options.initialState.systemPrompt,
        model: options.initialState.model,
        tools: options.initialState.tools ?? [],
        messages: [],
      };
    }

    async prompt(text: string): Promise<void> {
      // Simulate the agent adding an assistant reply to messages.
      this.state.messages.push({
        role: 'assistant',
        content: [{ type: 'text', text: `echo: ${text}` }],
      });
    }
  }

  return { Agent: MockAgent };
});

// ── Mock @mariozechner/pi-ai ─────────────────────────────────────────────────
vi.mock('@mariozechner/pi-ai', () => ({
  getModel: vi.fn(() => ({ id: 'mock', name: 'Mock Model' })),
  Type: {
    // Type.Unsafe() just passes the schema through in tests.
    Unsafe: (schema: unknown) => schema,
  },
}));

// ── Import under test (after mocks are declared) ────────────────────────────
const { createAgent } = await import('./createAgent.js');

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeEchoTool(): ToolDefinition {
  return {
    name: 'echo',
    description: 'Echoes the input text',
    inputSchema: z.object({ text: z.string() }),
    // handler receives unknown from the registry; we treat the whole input as
    // the output for this test stub.
    handler: async (input) => input,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('createAgent', () => {
  it('returns an agent whose sendMessage() resolves to a string (smoke test)', async () => {
    const agent = await createAgent({
      systemPrompt: 'You are a test assistant.',
      tools: [makeEchoTool()],
    });

    const reply = await agent.sendMessage('hi');
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
  });

  it('sendMessage() returns the assistant text content', async () => {
    const agent = await createAgent({
      systemPrompt: 'You are a test assistant.',
      tools: [],
    });

    const reply = await agent.sendMessage('hello');
    expect(reply).toBe('echo: hello');
  });

  it('throws when a tool name is in BLOCKED_TOOL_NAMES (defense in depth)', async () => {
    const blockedTool: ToolDefinition = {
      name: 'bash',
      description: 'A bash tool that must be blocked',
      inputSchema: z.object({}),
      handler: async () => undefined,
    };

    await expect(
      createAgent({ systemPrompt: 'test', tools: [blockedTool] }),
    ).rejects.toThrow(/bash.*blocked|blocked.*bash/i);
  });

  it('throws for any blocked tool name', async () => {
    for (const name of ['read', 'write', 'shell', 'exec', 'spawn']) {
      const tool: ToolDefinition = {
        name,
        description: 'blocked',
        inputSchema: z.object({}),
        handler: async () => undefined,
      };
      await expect(
        createAgent({ systemPrompt: 'test', tools: [tool] }),
      ).rejects.toThrow(/blocked/);
    }
  });
});
